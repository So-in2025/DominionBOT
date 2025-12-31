

import { Request, Response } from 'express';
// FIX: Import Buffer to resolve 'Cannot find name Buffer' error.
import { Buffer } from 'buffer';
// FIX: Import connectToWhatsApp, disconnectWhatsApp, sendMessage as they are now exported.
import { connectToWhatsApp, disconnectWhatsApp, sendMessage, getSessionStatus, processAiResponseForJid } from '../whatsapp/client.js'; // Import processAiResponseForJid
import { conversationService } from '../services/conversationService.js';
import { Message, LeadStatus, User } from '../types.js';
import { db } from '../database.js';
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
  if (!user || !user.conversations || !user.conversations[id]) {
      return res.status(404).json({ message: 'Conversación no encontrada.' });
  }

  const conversation = user.conversations[id];
  Object.assign(conversation, updates);
  
  await db.saveUserConversation(userId, conversation);
  res.json(conversation);
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
 * Inicia una secuencia de mensajes de prueba desde el "bot de pruebas" hacia el bot del cliente actual.
 */
export const handleStartClientTestBot = async (req: any, res: any) => {
    const userId = getUserId(req);
    const user = getUser(req); // User object from JWT

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

        // Responder al cliente inmediatamente para que el frontend pueda iniciar el polling
        res.status(200).json({ message: 'Secuencia de prueba de bot élite iniciada en background.' });

        // 3. Iniciar la secuencia de mensajes de prueba en segundo plano
        (async () => {
            logService.audit(`Iniciando prueba de bot élite para cliente (autodirigida): ${targetUser.username} en background`, userId, user.username);

            for (const messageText of TEST_SCRIPT) {
                // Añadir el mensaje del bot élite como si fuera un usuario al chat del cliente
                const eliteBotMessage: Message = { 
                    id: `elite_bot_msg_${Date.now()}_${Math.random().toString(36).substring(7)}`, 
                    text: messageText, 
                    sender: 'elite_bot', 
                    timestamp: new Date() 
                };
                await conversationService.addMessage(userId, ELITE_BOT_JID, eliteBotMessage, ELITE_BOT_NAME);

                // Trigger el procesamiento de la IA del cliente objetivo inmediatamente (sin debounce)
                await processAiResponseForJid(userId, ELITE_BOT_JID);

                // Pequeña pausa para simular una conversación
                await new Promise(resolve => setTimeout(resolve, 3000));
            }

            logService.audit(`Prueba de bot élite finalizada para cliente (autodirigida): ${targetUser.username} en background`, userId, user.username);
        })().catch(error => {
            logService.error(`Error en la secuencia de prueba del bot élite en background para ${userId} (autodirigida)`, error, userId, user.username);
        });

    } catch (error: any) {
        logService.error(`Error al iniciar la prueba del bot élite para ${userId} (autodirigida)`, error, userId, user.username);
        // Si el error ocurre antes de enviar la respuesta HTTP, lo manejamos aquí.
        // Si ya se envió la respuesta, este catch manejará los errores asíncronos en segundo plano.
        if (!res.headersSent) { // Check if response has already been sent
            res.status(500).json({ message: 'Error interno del servidor al iniciar la prueba.' });
        }
    }
};

/**
 * Elimina la conversación del "bot de pruebas" para el cliente actual.
 */
export const handleClearClientTestBotConversation = async (req: any, res: any) => {
    const userId = getUserId(req);
    const user = getUser(req);

    try {
        const targetUser = await db.getUser(userId);
        if (!targetUser) {
            return res.status(404).json({ message: 'Cliente objetivo no encontrado.' });
        }

        if (targetUser.conversations && targetUser.conversations[ELITE_BOT_JID]) {
            delete targetUser.conversations[ELITE_BOT_JID];
            await db.updateUser(userId, { conversations: targetUser.conversations });
            logService.audit(`Conversación de bot élite eliminada para cliente (autodirigida): ${targetUser.username}`, userId, user.username);
        } else {
            logService.info(`No se encontró conversación de bot élite para eliminar en cliente (autodirigida): ${targetUser.username}`, userId, user.username);
        }

        res.status(200).json({ message: 'Conversación de prueba de bot élite eliminada.' });

    } catch (error: any) {
        logService.error(`Error al limpiar la conversación del bot élite para ${userId} (autodirigida)`, error, userId, user.username);
        res.status(500).json({ message: 'Error interno del servidor al limpiar la conversación.' });
    }
};