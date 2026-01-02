
import { Request, Response } from 'express';
// FIX: Import Buffer to resolve 'Cannot find name Buffer' error.
import { Buffer } from 'buffer';
// FIX: Import connectToWhatsApp, disconnectWhatsApp, sendMessage as they are now exported.
import { connectToWhatsApp, disconnectWhatsApp, sendMessage, getSessionStatus, processAiResponseForJid, fetchUserGroups } from '../whatsapp/client.js'; // Import fetchUserGroups
import { conversationService } from '../services/conversationService.js';
import { Message, LeadStatus, User, Conversation, SimulationScenario, EvaluationResult, Campaign, RadarSignal } from '../types.js';
import { db, sanitizeKey } from '../database.js'; // Import sanitizeKey
import { logService } from '../services/logService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

// --- Test Bot Specifics ---
const ELITE_BOT_JID = '5491112345678@s.whatsapp.net'; // Consistent JID for the elite test bot
const ELITE_BOT_NAME = 'Dominion Elite Bot';

const SCENARIO_SCRIPTS: Record<SimulationScenario, string[]> = {
    'STANDARD_FLOW': [
        "Hola, estoy interesado en tus servicios. ¿Cómo funciona?",
        "¿Podrías explicarme un poco más sobre los beneficios?",
        "¿Cuál es el costo?",
        "Suena interesante. ¿Qué pasos siguen?",
        "Perfecto, me gustaría proceder."
    ],
    'PRICE_OBJECTION': [
        "Hola, vi tu anuncio. ¿Precio?",
        "Uff, me parece bastante caro comparado con otros.",
        "¿No tienen algún descuento o plan más barato?",
        "Entiendo el valor, pero se me va de presupuesto ahora.",
        "Voy a pensarlo si no pueden mejorar el número."
    ],
    'COMPETITOR_COMPARISON': [
        "Hola. Estoy viendo opciones. ¿Qué los hace diferentes a la competencia?",
        "Me han hablado de otra empresa que hace lo mismo por la mitad.",
        "¿Por qué debería elegirlos a ustedes?",
        "No veo la diferencia real en la propuesta.",
        "Ok, dame una razón para cerrar hoy con ustedes."
    ],
    'GHOSTING_RISK': [
        "Info.",
        "...",
        "¿Y el precio?",
        "...",
        "Ok."
    ],
    'CONFUSED_BUYER': [
        "Hola, ¿venden repuestos de autos?",
        "Ah, perdón, pensé que era otra cosa. ¿Pero qué hacen entonces?",
        "No entiendo muy bien para qué me serviría.",
        "¿Es como una estafa piramidal?",
        "Ah bueno, gracias igual."
    ]
};

// Memory Set to track active simulations for cancellation
const activeSimulations = new Set<string>();

const getUserId = (req: any) => req.user.id;
const getUser = (req: any) => req.user;


export const handleGetStatus = (req: any, res: any) => {
    const userId = getUserId(req);
    const statusData = getSessionStatus(userId);
    res.json(statusData);
};

export const handleConnect = async (req: any, res: any) => {
  const userId = getUserId(req);
  const { phoneNumber } = req.body; 
  try {
    // No esperamos await aquí para no bloquear el request http si tarda,
    // pero idealmente deberíamos manejar errores de inicio.
    // Para producción, mejor responder "Accepted" y dejar que el socket trabaje.
    connectToWhatsApp(userId, phoneNumber).catch(err => {
        console.error(`Error async connect ${userId}:`, err);
    });
    res.status(202).json({ message: 'Proceso de vinculación iniciado en background.' });
  } catch (error) {
    res.status(500).json({ message: 'Error al iniciar infraestructura de enlace.' });
  }
};

export const handleDisconnect = async (req: any, res: any) => {
  const userId = getUserId(req);
  try {
    await disconnectWhatsApp(userId);
    res.status(200).json({ message: 'Nodo desconectado.' });
  } catch (error) {
    res.status(500).json({ message: 'Error al desconectar.' });
  }
};

export const handleGetConversations = async (req: any, res: any) => {
  const userId = getUserId(req);
  const conversations = await conversationService.getConversations(userId);
  res.status(200).json(conversations);
};

export const handleSendMessage = async (req: any, res: any) => {
  const userId = getUserId(req);
  const { to, text } = req.body; 
  if (!to || !text) return res.status(400).json({ message: 'Datos incompletos.' });

  try {
    const jid = `${to.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    await sendMessage(userId, jid, text);
    
    const message: Message = {
        id: `owner-${Date.now()}`,
        sender: 'owner',
        text,
        timestamp: new Date()
    };
    await conversationService.addMessage(userId, jid, message);

    res.status(200).json({ message: 'Enviado.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error enviando mensaje. ¿Está conectado?' });
  }
};

export const handleUpdateConversation = async (req: any, res: any) => {
  const userId = getUserId(req);
  const { id, updates } = req.body;
  
  const user = await db.getUser(userId);
  // FIX: Check for sanitized key in the map
  const sanitizedId = sanitizeKey(id);
  const conversation = user?.conversations?.[sanitizedId] || user?.conversations?.[id]; // Fallback to raw id if old structure

  if (!user || !conversation) {
      return res.status(404).json({ message: 'Conversación no encontrada.' });
  }

  Object.assign(conversation, updates);
  
  await db.saveUserConversation(userId, conversation);
  res.json(conversation);
};

// NEW: Force AI Response Endpoint
export const handleForceAiRun = async (req: any, res: any) => {
    const userId = getUserId(req);
    const { id: jid } = req.body; // conversation id

    if (!jid) return res.status(400).json({ message: 'Falta el ID de conversación.' });

    try {
        logService.info(`[API] Solicitud manual de ejecución de IA para ${jid}`, userId);
        // PASS FORCE = TRUE
        processAiResponseForJid(userId, jid, true).catch(e => {
            logService.error(`[API] Error ejecutando IA manual para ${jid}`, e, userId);
        });
        
        res.status(200).json({ message: 'Procesamiento de IA iniciado.' });
    } catch (error) {
        logService.error('Error al forzar ejecución de IA', error, userId);
        res.status(500).json({ message: 'Error interno.' });
    }
};

// FIX: Changed res type from Response to any to avoid type conflicts.
export const handleGetTestimonials = async (req: Request, res: any) => {
  try {
    const testimonials = await db.getTestimonials();
    res.status(200).json(testimonials);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching testimonials.' });
  }
};

// FIX: Changed res type from Response to any to avoid type conflicts.
export const handlePostTestimonial = async (req: any, res: any) => {
  const { id: userId, username } = req.user;
  const { text } = req.body;

  if (!text || text.trim().length === 0 || text.trim().length > 250) {
    return res.status(400).json({ message: 'Testimonial text is invalid.' });
  }

  try {
    const user = await db.getUser(userId);
    if (!user) {
        return res.status(404).json({ message: 'User not found.' });
    }
    const newTestimonial = await db.createTestimonial(userId, user.business_name, text);
    logService.audit('Nuevo testimonio publicado', userId, username, { text });
    res.status(201).json(newTestimonial);
  } catch (error) {
    res.status(500).json({ message: 'Error creating testimonial.' });
  }
};

// --- Generic TTS Audio Handler ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const handleGetTtsAudio = async (req: any, res: any) => {
    const { eventName } = req.params;
    if (!eventName || !/^[a-zA-Z0-9_]+$/.test(eventName)) {
        return res.status(400).send('Nombre de evento inválido.');
    }

    // SECURITY FIX: Only landing_intro and alert_error_connection are public.
    if (eventName !== 'landing_intro' && eventName !== 'alert_error_connection' && !req.user) {
        return res.status(401).send('Autenticación requerida para este recurso de audio.');
    }
    
    const audioDir = path.resolve(__dirname, '..', '..', 'public', 'audio');
    const audioPath = path.join(audioDir, `${eventName}.mp3`);
    
    if (fs.existsSync(audioPath)) {
        return res.sendFile(audioPath);
    } else {
        const userIdForLog = req.user ? req.user.id : 'unauthenticated';
        logService.warn(`[TTS] Archivo de audio no encontrado para el evento: ${eventName}`, userIdForLog);
        return res.status(404).send('Audio no encontrado.');
    }
};

/**
 * Detiene la simulación del bot y ejecuta la evaluación.
 */
export const handleStopClientTestBot = async (req: any, res: any) => {
    const userId = getUserId(req);
    // FORCE REMOVE FROM ACTIVE SET
    if (activeSimulations.has(userId)) {
        activeSimulations.delete(userId);
        logService.info(`[SIMULATOR] Simulación detenida manualmente por el usuario ${userId}`, userId);
        return res.status(200).json({ message: 'Simulación detenida.' });
    }
    // Even if not strictly "active", ensure we respond success to reset frontend state
    res.status(200).json({ message: 'Simulación detenida (No estaba activa).' });
};

/**
 * Inicia una secuencia de mensajes de prueba con escenario específico.
 */
export const handleStartClientTestBot = async (req: any, res: any) => {
    const userId = getUserId(req);
    const user = getUser(req); 
    const { scenario } = req.body; // New parameter

    const selectedScenario: SimulationScenario = scenario || 'STANDARD_FLOW';
    const script = SCENARIO_SCRIPTS[selectedScenario];

    if (activeSimulations.has(userId)) {
        return res.status(400).json({ message: 'Ya hay una simulación en curso.' });
    }

    try {
        let targetUser = await db.getUser(userId);
        if (!targetUser) {
            return res.status(404).json({ message: 'Cliente objetivo no encontrado.' });
        }

        // 1. Asegurarse de que el bot del cliente esté activo
        if (!targetUser.settings.isActive) {
            targetUser.settings.isActive = true;
            await db.updateUserSettings(userId, { isActive: true });
            logService.audit(`Bot del cliente ${targetUser.username} activado para prueba (por cliente).`, userId, user.username);
        }
        
        // 2. Resetear contador de leads calificados
        await db.updateUser(userId, { trial_qualified_leads_count: 0 });

        // 3. FORCE RESET CONVERSATION STATE
        // We delete it first to ensure no stale data ghosts remain
        const safeJid = sanitizeKey(ELITE_BOT_JID);
        if (targetUser.conversations) {
             delete targetUser.conversations[safeJid];
             await db.updateUser(userId, { conversations: targetUser.conversations });
        }

        // Create fresh clean conversation
        const cleanConversation: Conversation = {
            id: ELITE_BOT_JID,
            leadIdentifier: 'Simulador',
            leadName: `${ELITE_BOT_NAME} [${selectedScenario}]`,
            status: LeadStatus.COLD,
            messages: [],
            isBotActive: true,
            isMuted: false, 
            isTestBotConversation: true, 
            tags: [],
            internalNotes: [],
            isAiSignalsEnabled: true,
            lastActivity: new Date()
        };
        await db.saveUserConversation(userId, cleanConversation);
        
        // Mark as active
        activeSimulations.add(userId);

        res.status(200).json({ message: 'Secuencia de prueba iniciada.' });

        // 4. Bucle de Simulación
        (async () => {
            logService.audit(`Iniciando prueba Elite++ (${selectedScenario}) para: ${targetUser.username}`, userId, user.username);
            const startTime = Date.now();

            for (const messageText of script) {
                // Critical check inside loop
                if (!activeSimulations.has(userId)) {
                    logService.info('[SIMULATOR] Secuencia abortada por usuario.', userId);
                    break;
                }

                // 4.1 Añadir mensaje del "Elite Bot" (Usuario simulado)
                const msgTimestamp = new Date();
                const eliteBotMessage: Message = { 
                    id: `elite_bot_${Date.now()}_${Math.random().toString(36).substring(7)}`, 
                    text: messageText, 
                    sender: 'elite_bot', // Identified as elite bot in backend, mapped to 'user' in frontend if needed
                    timestamp: msgTimestamp 
                };
                
                // Add message using service (appends correctly)
                await conversationService.addMessage(userId, ELITE_BOT_JID, eliteBotMessage, ELITE_BOT_NAME);

                // 4.2 Trigger AI Processing (this will generate 'bot' response and append it)
                await processAiResponseForJid(userId, ELITE_BOT_JID);

                // 4.3 Smart Wait for Bot Response
                // We poll until we see a new message from 'bot'
                let botResponded = false;
                let attempts = 0;
                const maxAttempts = 40; // 40 seconds max wait (generous for cold starts)

                while (!botResponded && attempts < maxAttempts) {
                    if (!activeSimulations.has(userId)) break; 

                    await new Promise(resolve => setTimeout(resolve, 1000)); // Poll every 1s
                    
                    // Fetch directly from DB service to get truth
                    const currentConvs = await conversationService.getConversations(userId);
                    const currentConv = currentConvs.find(c => c.id === ELITE_BOT_JID);
                    
                    if (currentConv) {
                        // Check for any message from 'bot' that is newer than our sent message
                        const response = currentConv.messages.find(m => 
                            m.sender === 'bot' && 
                            new Date(m.timestamp).getTime() >= msgTimestamp.getTime()
                        );
                        if (response) {
                            botResponded = true;
                        }
                    }
                    attempts++;
                }

                if (!activeSimulations.has(userId)) break;

                // 4.4 Human Reading Pause (Realism)
                if (botResponded) {
                    // Wait 2-4 seconds before next message to simulate reading
                    await new Promise(resolve => setTimeout(resolve, 2500));
                } else {
                    logService.warn(`[SIMULATOR] Timeout esperando respuesta de IA. Continuando secuencia de todos modos.`, userId);
                }
            }

            logService.audit(`Prueba de bot élite finalizada para cliente: ${targetUser.username}`, userId, user.username);
            activeSimulations.delete(userId); 

            // --- 5. EVALUATION LOGIC (ELITE++) ---
            try {
                // Fetch final conversation state
                const finalConvs = await conversationService.getConversations(userId);
                const finalConv = finalConvs.find(c => c.id === ELITE_BOT_JID);
                const updatedUser = await db.getUser(userId);

                if (finalConv && updatedUser) {
                    // Basic heuristic evaluation (To be replaced by LLM judge later)
                    let score = 50; // Base score
                    let outcome: EvaluationResult['outcome'] = 'NEUTRAL';
                    let failurePattern: string | undefined = undefined;
                    const insights: string[] = [];

                    // Score Logic
                    if (finalConv.status === LeadStatus.HOT) {
                        score += 40;
                        outcome = 'SUCCESS';
                        insights.push("Cierre exitoso detectado.");
                    } else if (finalConv.status === LeadStatus.WARM) {
                        score += 20;
                        outcome = 'NEUTRAL';
                        insights.push("Lead nutrido pero no cerrado.");
                    } else {
                        score -= 10;
                        outcome = 'FAILURE';
                        insights.push("Fallo en calificar.");
                    }

                    // Failure Detection Heuristics
                    if (selectedScenario === 'PRICE_OBJECTION' && finalConv.status !== LeadStatus.HOT) {
                        failurePattern = "Price Friction Collapse";
                        insights.push("La IA no superó la objeción de precio.");
                        score -= 20;
                    }
                    if (selectedScenario === 'GHOSTING_RISK' && finalConv.messages.length < 4) {
                        failurePattern = "Early Engagement Drop";
                        insights.push("Abandono prematuro de la conversación.");
                        score -= 15;
                    }

                    const result: EvaluationResult = {
                        score: Math.max(0, Math.min(100, score)),
                        outcome,
                        detectedFailurePattern: failurePattern,
                        insights
                    };

                    // Save Experiment
                    const runData: any = {
                        id: `exp_${Date.now()}`,
                        timestamp: new Date().toISOString(),
                        scenario: selectedScenario,
                        brainVersionSnapshot: {
                            archetype: updatedUser.settings.archetype,
                            tone: updatedUser.settings.toneValue
                        },
                        durationSeconds: (Date.now() - startTime) / 1000,
                        evaluation: result
                    };

                    // Persist to User Lab
                    const lab = updatedUser.simulationLab || { experiments: [], aggregatedScore: 0, topFailurePatterns: {} };
                    lab.experiments.push(runData);
                    
                    // Update stats
                    lab.aggregatedScore = Math.round((lab.aggregatedScore * (lab.experiments.length - 1) + score) / lab.experiments.length);
                    if (failurePattern) {
                        lab.topFailurePatterns[failurePattern] = (lab.topFailurePatterns[failurePattern] || 0) + 1;
                    }

                    await db.updateUser(userId, { simulationLab: lab });
                    logService.info(`[LAB] Experimento registrado para ${userId}. Score: ${score}`, userId);
                }
            } catch (evalErr) {
                logService.error(`[LAB] Error en evaluación post-simulación`, evalErr, userId);
            }

        })().catch(error => {
            logService.error(`Error en la secuencia de prueba del bot élite`, error, userId, user.username);
            activeSimulations.delete(userId);
        });

    } catch (error: any) {
        logService.error(`Error al iniciar la prueba del bot élite`, error, userId, user.username);
        activeSimulations.delete(userId);
        if (!res.headersSent) { 
            res.status(500).json({ message: 'Error interno del servidor al iniciar la prueba.' });
        }
    }
};

/**
 * Elimina la conversación del "bot de pruebas" para el cliente actual.
 */
export const handleClearClientTestBotConversation = async (req: any, res: any) => {
    const userId = getUserId(req);
    activeSimulations.delete(userId); // Ensure stopped

    try {
        const targetUser = await db.getUser(userId);
        if (!targetUser) return res.status(404).json({ message: 'Cliente no encontrado.' });

        const safeJid = sanitizeKey(ELITE_BOT_JID);
        // Force delete using MongoDB update unset or pulling
        if (targetUser.conversations) {
             delete targetUser.conversations[safeJid];
             delete targetUser.conversations[ELITE_BOT_JID]; // Just in case
             await db.updateUser(userId, { conversations: targetUser.conversations });
        }

        res.status(200).json({ message: 'Conversación de prueba eliminada.' });

    } catch (error: any) {
        logService.error(`Error al limpiar conversación simulador`, error, userId);
        res.status(500).json({ message: 'Error interno.' });
    }
};

// --- NEW CAMPAIGN HANDLERS ---

export const handleGetCampaigns = async (req: any, res: any) => {
    const userId = getUserId(req);
    try {
        const campaigns = await db.getCampaigns(userId);
        res.json(campaigns);
    } catch(e) {
        res.status(500).json({ message: 'Error obteniendo campañas.' });
    }
};

export const handleCreateCampaign = async (req: any, res: any) => {
    const userId = getUserId(req);
    const data = req.body;
    
    // Basic validation: name, message OR imageUrl, groups are required
    if (!data.name || (!data.message && !data.imageUrl) || !data.groups || data.groups.length === 0) {
        return res.status(400).json({ message: 'Faltan datos. Debes incluir mensaje o imagen.' });
    }

    try {
        const campaign: Campaign = {
            id: uuidv4(),
            userId,
            name: data.name,
            message: data.message || "", // Fallback to empty string if only image
            imageUrl: data.imageUrl, // Capture Image
            groups: data.groups,
            status: 'DRAFT',
            schedule: data.schedule || { type: 'ONCE' },
            config: data.config || { minDelaySec: 10, maxDelaySec: 30 },
            stats: { totalSent: 0, totalFailed: 0 },
            createdAt: new Date().toISOString()
        };

        const created = await db.createCampaign(campaign);
        res.status(201).json(created);
    } catch(e) {
        res.status(500).json({ message: 'Error creando campaña.' });
    }
};

export const handleUpdateCampaign = async (req: any, res: any) => {
    const userId = getUserId(req);
    const { id } = req.params;
    const updates = req.body;

    try {
        const campaign = await db.getCampaign(id);
        if (!campaign || campaign.userId !== userId) {
            return res.status(404).json({ message: 'Campaña no encontrada.' });
        }

        // Logic for nextRunAt if Activating
        if (updates.status === 'ACTIVE' && campaign.status !== 'ACTIVE') {
            const now = new Date();
            // If it's a future scheduled one, keep schedule. If it's ONCE and no date, run now.
            if (updates.schedule?.startDate) {
                updates.stats = { ...campaign.stats, nextRunAt: updates.schedule.startDate };
            } else if (!campaign.stats.nextRunAt) {
                updates.stats = { ...campaign.stats, nextRunAt: now.toISOString() };
            }
        }

        const updated = await db.updateCampaign(id, updates);
        res.json(updated);
    } catch(e) {
        res.status(500).json({ message: 'Error actualizando campaña.' });
    }
};

export const handleDeleteCampaign = async (req: any, res: any) => {
    const userId = getUserId(req);
    const { id } = req.params;
    try {
        const campaign = await db.getCampaign(id);
        if (!campaign || campaign.userId !== userId) {
            return res.status(404).json({ message: 'Campaña no encontrada.' });
        }
        await db.deleteCampaign(id);
        res.json({ message: 'Eliminada.' });
    } catch(e) {
        res.status(500).json({ message: 'Error eliminando campaña.' });
    }
};

export const handleGetWhatsAppGroups = async (req: any, res: any) => {
    const userId = getUserId(req);
    try {
        const groups = await fetchUserGroups(userId);
        res.json(groups);
    } catch(e: any) {
        // If connection fails or no groups
        console.error(e);
        res.status(500).json({ message: 'No se pudieron obtener los grupos. ¿Bot conectado?' });
    }
};

// --- RADAR ENDPOINTS ---
export const handleGetRadarSignals = async (req: any, res: any) => {
    const userId = getUserId(req);
    // NEW: Allow filtering by status to support history view
    const historyMode = req.query.history === 'true';
    
    try {
        if (historyMode) {
            const allSignals = await db.getRadarSignals(userId, 200); 
            res.json(allSignals);
        } else {
            const signals = await db.getRadarSignals(userId);
            res.json(signals);
        }
    } catch(e) {
        res.status(500).json({ message: 'Error al obtener señales de radar.' });
    }
};

export const handleGetRadarSettings = async (req: any, res: any) => {
    const userId = getUserId(req);
    try {
        const settings = await db.getRadarSettings(userId);
        res.json(settings);
    } catch(e) {
        res.status(500).json({ message: 'Error al obtener configuración de radar.' });
    }
};

export const handleUpdateRadarSettings = async (req: any, res: any) => {
    const userId = getUserId(req);
    try {
        const updated = await db.updateRadarSettings(userId, req.body);
        res.json(updated);
    } catch(e) {
        res.status(500).json({ message: 'Error al actualizar configuración de radar.' });
    }
};

export const handleDismissRadarSignal = async (req: any, res: any) => {
    const userId = getUserId(req); // Security check
    const { id } = req.params;
    try {
        await db.updateRadarSignalStatus(id, 'DISMISSED');
        res.json({ message: 'Oportunidad descartada.' });
    } catch(e) {
        res.status(500).json({ message: 'Error al descartar señal.' });
    }
};

// NEW: Convert Signal to Lead (Bridge)
export const handleConvertRadarSignal = async (req: any, res: any) => {
    const userId = getUserId(req);
    const { id } = req.params;

    try {
        // 1. Get Signal Data (Need a DB method for this, or just assume we have it on frontend?)
        // For security, we should fetch it.
        // Quick workaround: Retrieve signals and find it.
        const signals = await db.getRadarSignals(userId, 1000); 
        const signal = signals.find(s => s.id === id);

        if (!signal) {
            return res.status(404).json({ message: 'Señal no encontrada.' });
        }

        // 2. Create Conversation
        const initialStatus = signal.analysis.score >= 80 ? LeadStatus.HOT : LeadStatus.WARM;
        const noteText = `[RADAR] Oportunidad detectada en grupo: ${signal.groupName}\nIntención: ${signal.analysis.intentType}\nMensaje original: "${signal.messageContent}"`;
        
        // We use conversationService to inject a system message or just create the convo
        // We'll mimic an incoming message to initialize the conversation properly
        const dummyMsg: Message = {
            id: `radar_${Date.now()}`,
            sender: 'user', // Treat as user so it appears in inbox
            text: signal.messageContent, // Use original text as the "start"
            timestamp: new Date()
        };

        // Inject lead
        await conversationService.addMessage(userId, signal.senderJid, dummyMsg, signal.senderName || signal.senderJid.split('@')[0]);
        
        // Update status immediately to WARM/HOT
        const user = await db.getUser(userId);
        const safeJid = sanitizeKey(signal.senderJid);
        const convo = user?.conversations?.[safeJid] || user?.conversations?.[signal.senderJid];
        
        if (convo) {
            convo.status = initialStatus;
            convo.tags = [...(convo.tags || []), 'RADAR_OPPORTUNITY'];
            // Add internal note
            convo.internalNotes = [...(convo.internalNotes || []), {
                id: Date.now().toString(),
                author: 'AI',
                note: noteText,
                timestamp: new Date()
            }];
            await db.saveUserConversation(userId, convo);
        }

        // 3. Mark Signal as ACTED
        await db.updateRadarSignalStatus(id, 'ACTED');

        // 4. Update Group Memory (Success Loop) - NEW RADAR 4.0 LOCK-IN
        try {
            const groupMemory = await db.getGroupMemory(signal.groupJid);
            const currentWins = groupMemory?.successfulWindows || 0;
            
            await db.updateGroupMemory(signal.groupJid, {
                successfulWindows: currentWins + 1,
                lastUpdated: new Date().toISOString()
            });
            logService.info(`[RADAR-4.0] Aprendizaje reforzado para grupo ${signal.groupJid}. Ventanas exitosas: ${currentWins + 1}`, userId);
        } catch (memError) {
            logService.warn(`[RADAR-4.0] No se pudo actualizar memoria de grupo tras conversión.`, userId);
        }

        res.json({ message: 'Conversión exitosa. Lead creado.' });

    } catch(e) {
        logService.error('Error convirtiendo señal a lead', e, userId);
        res.status(500).json({ message: 'Error al convertir señal.' });
    }
};

export const handleSimulateRadarSignal = async (req: any, res: any) => {
    const userId = getUserId(req);
    try {
        const dummySignal: RadarSignal = {
            id: uuidv4(),
            userId,
            groupJid: '12345678@g.us',
            groupName: 'Marketplace Mendoza',
            senderJid: `549261${Math.floor(100000 + Math.random() * 900000)}@s.whatsapp.net`,
            senderName: 'Usuario Simulado',
            messageContent: 'Hola, estoy buscando alguien que ofrezca este servicio urgente. ¿Alguien recomienda?',
            timestamp: new Date().toISOString(),
            status: 'NEW',
            analysis: {
                score: 95,
                category: 'OPPORTUNITY',
                intentType: 'URGENT',
                reasoning: 'Simulación de prueba: Detectada intención de compra explícita con alta urgencia.',
                suggestedAction: 'Contactar inmediatamente.'
            },
            strategicScore: 98,
            predictedWindow: {
                confidenceScore: 95,
                urgencyLevel: 'CRITICAL',
                delayRisk: 'HIGH',
                reasoning: 'El usuario está activo ahora mismo buscando solución.'
            },
            hiddenSignals: [
                { type: 'MICRO_LANGUAGE', description: 'Uso de palabra "urgente"', intensity: 9 }
            ]
        };

        await db.createRadarSignal(dummySignal);
        logService.info(`[RADAR-SIM] Señal simulada inyectada para ${userId}`, userId);
        res.json({ message: 'Señal simulada creada.' });
    } catch(e) {
        logService.error('Error simulando señal', e, userId);
        res.status(500).json({ message: 'Error interno.' });
    }
};

// NEW: Endpoint to fetch live Radar trace logs for the user
export const handleGetRadarActivityLogs = async (req: any, res: any) => {
    const userId = getUserId(req);
    try {
        // Query the main log collection for logs from this user containing the trace tag
        // We rely on logService persistence
        // Accessing db directly here as a shortcut, ideally via logService method but logService is a wrapper.
        // We'll use a direct DB query for now as `db.getLogs` is admin only usually.
        // Let's implement a specific query in `db` for this or reuse getLogs but filter.
        
        // Since `db.getLogs` fetches ALL, we need a user-specific one.
        // Let's assume we can query LogModel directly via a new db method or add one.
        // For simplicity, I'll add `getUserLogs` to `Database` class in the future, but here I can hack it if `LogModel` was exported.
        // Since `db` encapsulates models, I should add `db.getRadarTraceLogs(userId)`.
        
        // Let's modify `database.ts` to add this method or use existing one if possible.
        // Existing `getLogs` has no filter.
        
        // Wait, I can't modify `database.ts` in this specific file block easily without repeating the whole file.
        // However, I can use `db.getLogs` and filter in memory if volume is low, OR assume `db` has a method I will add.
        // I will add `getRadarTraceLogs` to `database.ts` in the next change block if needed, but to keep it simple:
        // I'll create the method in `database.ts` in the same step/commit logic if possible.
        // BUT, I can't edit multiple files in one `change` block.
        
        // Actually, I can edit `database.ts` too.
        
        const logs = await db.getRadarTraceLogs(userId);
        res.json(logs);
    } catch (e) {
        res.status(500).json({ message: 'Error fetching radar traces.' });
    }
};
