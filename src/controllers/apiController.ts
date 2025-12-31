import { Request, Response } from 'express';
// FIX: Import Buffer to resolve 'Cannot find name Buffer' error.
import { Buffer } from 'buffer';
import { connectToWhatsApp, disconnectWhatsApp, sendMessage, getSessionStatus } from '../whatsapp/client.js';
import { conversationService } from '../services/conversationService.js';
import { Message } from '../types.js';
import { db } from '../database.js';
import { logService } from '../services/logService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const getUserId = (req: any) => req.user.id;

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