
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dominion-local-secret-key';

export const authenticateToken = (req: any, res: any, next: (err?: any) => void) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; 

  if (!token) {
    return res.status(401).json({ message: 'Acceso denegado. Se requiere token.' });
  }

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) {
      console.error(`[AUTH-MIDDLEWARE] Token Rechazado: ${err.message}`);
      return res.status(403).json({ message: 'Token inválido o expirado.', error: err.message });
    }
    req.user = user;
    next();
  });
};
