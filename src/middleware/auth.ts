
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../env.js'; // Use centralized secret

export const authenticateToken = (req: any, res: any, next: (err?: any) => void) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; 

  if (!token) {
    return res.status(401).json({ message: 'Acceso denegado. Se requiere token.' });
  }

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) {
      console.error(`[AUTH-FAIL] Token inválido: ${err.message}`);
      // Log first few chars of secret for debugging (safe in local dev)
      console.error(`[DEBUG] Secret used for verification ends with: ...${JWT_SECRET.slice(-4)}`);
      return res.status(403).json({ message: 'Token inválido o expirado.', error: err.message });
    }
    req.user = user;
    next();
  });
};
