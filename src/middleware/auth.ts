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
    console.log(`[AUTH-DEBUG] SSE path detected: ${req.path}. Attempting to retrieve token from query.`);
    token = req.query.token as string;
  } else if (req.path === '/api/events') {
      console.log(`[AUTH-DEBUG] SSE path detected: ${req.path}. No token found in query, checking Authorization header. Current token: ${token}`);
  }


  if (!token) {
    console.error(`[AUTH-DEBUG] NO TOKEN PROVIDED. Returning 401 for path: ${req.path}`);
    return res.status(401).json({ message: 'Acceso denegado. Se requiere token.' });
  }

  try {
    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) {
        console.error(`[AUTH-DEBUG] JWT verification FAILED for ${req.path}: ${err.message}. Token: ${token}`);
        // Considerar si es un token expirado vs. inválido para dar mejor feedback.
        // Por ahora, un 403 es suficiente para cualquier fallo de verificación.
        return res.status(403).json({ message: 'Token inválido o expirado.', error: err.message });
      }
      console.log(`[AUTH-DEBUG] JWT verified SUCCESSFULLY for ${req.path}. User ID: ${user.id}, Username: ${user.username}`);
      req.user = user;
      next();
    });
  } catch (e: any) {
    console.error("[AUTH-CRITICAL] Error caught during JWT verification:", e);
    return res.status(500).json({ message: "Error interno de autenticación" });
  }
}