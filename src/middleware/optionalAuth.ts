import { NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../env.js';

export function optionalAuthenticateToken(req: any, res: any, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; 

  if (!token) {
    return next(); // No hay token, simplemente continuar a la siguiente ruta/middleware
  }

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (!err && user) {
      req.user = user; // El token es válido, adjuntar el usuario a la petición
    }
    // Si el token es inválido, no lanzamos un error, simplemente procedemos sin un objeto de usuario
    next();
  });
}
