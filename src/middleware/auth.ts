
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../env.js';

// Usamos 'export function' explícitamente para evitar problemas de resolución de alias en TS
// Fixed: Changed next parameter type to any to resolve "Type 'NextFunction' has no call signatures"
export function authenticateToken(req: any, res: any, next: any) {
  let token: string | undefined;

  // Prioritize token from query parameters for SSE as EventSource typically doesn't support Authorization headers reliably.
  if (req.path === '/api/events' && req.query.token) {
    token = req.query.token as string;
  } else {
    // For all other routes, or if SSE query token is not present, check Authorization header.
    token = req.headers['authorization']?.split(' ')[1];
  }

  if (!token) {
    console.error(`[AUTH-FAIL] NO TOKEN PROVIDED for path: ${req.path}`);
    return res.status(401).json({ message: 'Acceso denegado. Se requiere token.' });
  }

  try {
    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) {
        console.error(`[AUTH-FAIL] JWT verification FAILED for ${req.path}: ${err.message}.`);
        return res.status(403).json({ message: 'Token inválido o expirado.', error: err.message });
      }
      req.user = user;
      next();
    });
  } catch (e: any) {
    console.error("[AUTH-CRITICAL] Error caught during JWT verification:", e);
    return res.status(500).json({ message: "Error interno de autenticación" });
  }
}
