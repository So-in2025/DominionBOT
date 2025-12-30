
import { Request, Response } from 'express';
import { sseService } from '../services/sseService';
import { connectToWhatsApp, disconnectWhatsApp, sendMessage } from '../whatsapp/client';
import { conversationService } from '../services/conversationService';
import { Message } from '../types';
import { db } from '../database';

// Helper to get UserID from auth middleware
const getUserId = (req: any) => req.user.id;

export const handleSse = (req: any, res: any) => {
  const token = req.query.token as string;
  if(!token) return res.status(401).end();
  
  try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(base64));
      sseService.addClient(payload.id, res);
  } catch(e) {
      res.status(401).end();
  }
};

export const handleConnect = async (req: any, res: any) => {
  const userId = getUserId(req);
  try {
    await connectToWhatsApp(userId);
    res.status(200).json({ message: 'Iniciando sesión...' });
  } catch (error) {
    res.status(500).json({ message: 'Error al iniciar.' });
  }
};

export const handleDisconnect = async (req: any, res: any) => {
  const userId = getUserId(req);
  try {
    await disconnectWhatsApp(userId);
    res.status(200).json({ message: 'Desconectado.' });
  } catch (error) {
    res.status(500).json({ message: 'Error al desconectar.' });
  }
};

export const handleGetConversations = (req: any, res: any) => {
  const userId = getUserId(req);
  const conversations = conversationService.getConversations(userId);
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
    conversationService.addMessage(userId, jid, message);

    res.status(200).json({ message: 'Enviado.' });
  } catch (error) {
    res.status(500).json({ message: 'Error enviando mensaje. ¿Está conectado?' });
  }
};

// Update conversation metadata (tags, notes, status)
export const handleUpdateConversation = async (req: any, res: any) => {
  const userId = getUserId(req);
  const { id, updates } = req.body;
  
  const user = db.getUser(userId);
  if (!user || !user.conversations[id]) return res.status(404).json({ message: 'Conversación no encontrada.' });

  const conversation = user.conversations[id];
  Object.assign(conversation, updates);
  
  await db.saveUserConversation(userId, conversation);
  res.json(conversation);
};

// USER SETTINGS
export const handleGetSettings = (req: any, res: any) => {
    const userId = getUserId(req);
    const user = db.getUser(userId);
    res.json(user?.settings || {});
};

export const handleUpdateSettings = (req: any, res: any) => {
    const userId = getUserId(req);
    const updated = db.updateUserSettings(userId, req.body);
    res.json(updated);
};
