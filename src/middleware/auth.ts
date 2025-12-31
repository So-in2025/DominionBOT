
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../env.js';

// Usamos 'export function' explícitamente para evitar problemas de resolución de alias en TS
export function authenticateToken(req: any, res: any, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; 

  if (!token) {
    return res.status(401).json({ message: 'Acceso denegado. Se requiere token.' });
  }

  try {
    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) {
        console.error(`[AUTH-FAIL] Token inválido: ${err.message}`);
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
