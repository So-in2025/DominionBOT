
import { Request, Response } from 'express';
// FIX: Import Buffer to resolve 'Cannot find name Buffer' error.
import { Buffer } from 'buffer';
// FIX: Import connectToWhatsApp, disconnectWhatsApp, sendMessage as they are now exported.
import { connectToWhatsApp, disconnectWhatsApp, sendMessage, getSessionStatus, processAiResponseForJid } from '../whatsapp/client.js'; // Import processAiResponseForJid
import { conversationService } from '../services/conversationService.js';
import { Message, LeadStatus, User, Conversation } from '../types.js';
import { db, sanitizeKey } from '../database.js'; // Import sanitizeKey
import { logService } from '../services/logService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Test Bot Specifics ---
const ELITE_BOT_JID = '5491112345678@s.whatsapp.net'; // Consistent JID for the elite test bot
const ELITE_BOT_NAME = 'Dominion Elite Test Bot';

const TEST_SCRIPT = [
    "Hola, estoy interesado en tus servicios. ¿Cómo funciona?",
    "¿Podrías explicarme un poco más sobre el plan PRO?",
    "¿Cuál es el costo mensual?",
    "¿Ofrecen alguna garantía o prueba?",
    "Suena interesante. Creo que estoy listo para ver una demo o empezar. ¿Qué debo hacer ahora?",
];

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
 * Detiene la simulación del bot.
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
 * Inicia una secuencia de mensajes de prueba desde el "bot de pruebas" hacia el bot del cliente actual.
 */
export const handleStartClientTestBot = async (req: any, res: any) => {
    const userId = getUserId(req);
    const user = getUser(req); // User object from JWT

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
        // 2. Opcional: Resetear el contador de leads calificados para un test limpio
        await db.updateUser(userId, { trial_qualified_leads_count: 0 });

        // 3. FORCE RESET CONVERSATION STATE (CRITICAL FIX)
        const cleanConversation: Conversation = {
            id: ELITE_BOT_JID,
            leadIdentifier: 'Simulador',
            leadName: ELITE_BOT_NAME,
            status: LeadStatus.COLD,
            messages: [], // Limpiamos historial
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

        // Responder al cliente inmediatamente
        res.status(200).json({ message: 'Secuencia de prueba iniciada.' });

        // 4. Iniciar la secuencia de mensajes de prueba en segundo plano
        (async () => {
            logService.audit(`Iniciando prueba de bot élite (sincrónica) para: ${targetUser.username}`, userId, user.username);

            for (const messageText of TEST_SCRIPT) {
                if (!activeSimulations.has(userId)) {
                    logService.info('[SIMULATOR] Secuencia abortada.', userId);
                    break;
                }

                // Pausa inicial para realismo y asegurar que la DB se actualizó
                await new Promise(resolve => setTimeout(resolve, 1500));

                // Añadir el mensaje del bot élite
                const msgTimestamp = new Date();
                const eliteBotMessage: Message = { 
                    id: `elite_bot_msg_${Date.now()}_${Math.random().toString(36).substring(7)}`, 
                    text: messageText, 
                    sender: 'elite_bot', 
                    timestamp: msgTimestamp 
                };
                
                // CRITICAL: Ensure this write is awaited properly
                await conversationService.addMessage(userId, ELITE_BOT_JID, eliteBotMessage, ELITE_BOT_NAME);

                // Trigger AI
                await processAiResponseForJid(userId, ELITE_BOT_JID);

                // --- ESPERA INTELIGENTE (SMART WAIT) ---
                let botResponded = false;
                let attempts = 0;
                const maxAttempts = 30; // 30 segundos max espera

                while (!botResponded && attempts < maxAttempts) {
                    if (!activeSimulations.has(userId)) break; 

                    await new Promise(resolve => setTimeout(resolve, 1000)); // Polling 1s
                    
                    // Re-fetch conversation to check for new messages
                    // We must refetch fresh from DB every time
                    const currentConvs = await conversationService.getConversations(userId);
                    const currentConv = currentConvs.find(c => c.id === ELITE_BOT_JID);
                    
                    if (currentConv) {
                        const response = currentConv.messages.find(m => 
                            m.sender === 'bot' && 
                            new Date(m.timestamp).getTime() > msgTimestamp.getTime()
                        );
                        if (response) {
                            botResponded = true;
                        }
                    }
                    attempts++;
                }

                if (!activeSimulations.has(userId)) break;

                // Pausa de lectura humana antes de enviar el siguiente mensaje
                if (botResponded) {
                    await new Promise(resolve => setTimeout(resolve, 3000));
                } else {
                    // Si hubo timeout, loguear advertencia pero continuar la secuencia
                    logService.warn(`[SIMULATOR] Timeout esperando respuesta de IA para: "${messageText.substring(0, 20)}..."`, userId);
                }
            }

            logService.audit(`Prueba de bot élite finalizada para cliente: ${targetUser.username}`, userId, user.username);
            activeSimulations.delete(userId); 
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
