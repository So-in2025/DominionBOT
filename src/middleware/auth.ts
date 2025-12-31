import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../env.js';

// Usamos 'export function' explícitamente para evitar problemas de resolución de alias en TS
// Fixed: Changed next parameter type to any to resolve "Type 'NextFunction' has no call signatures"
export function authenticateToken(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1]; 

  // Si no hay token en el encabezado Authorization, verificar el parámetro de consulta para la ruta SSE.
  // Esto es necesario porque EventSource no permite headers custom y el token se envía por URL.
  if (!token && req.path === '/api/events' && req.query.token) {
    token = req.query.token as string;
  }

  if (!token) {
    return res.status(401).json({ message: 'Acceso denegado. Se requiere token.' });
  }

  try {
    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) {
        console.error(`[AUTH-FAIL] Token inválido: ${err.message}`);
        // Considerar si es un token expirado vs. inválido para dar mejor feedback.
        // Por ahora, un 403 es suficiente para cualquier fallo de verificación.
        return res.status(403).json({ message: 'Token inválido o expirado.', error: err.message });
      }
      req.user = user;
      next();
    });
  } catch (e: any) {
    console.error("[AUTH-CRITICAL]", e);
    return res.status(500).json({ message: "Error interno de autenticación" });
  }
}