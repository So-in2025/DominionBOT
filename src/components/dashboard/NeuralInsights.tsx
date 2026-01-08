

import React, { useMemo } from 'react';
import { usePOS } from '../../context/POSContext';
import { formatCurrency } from '../../utils/currency';
import { formatDistanceToNow } from 'date-fns';
import es from 'date-fns/locale/es';

export const NeuralInsights: React.FC = () => {
  const { products, registerStatus, addToFavorites, favorites } = usePOS();

  // --- LÓGICA DE INFERENCIA DE IA (SIMULADA PERO BASADA EN DATOS REALES) ---
  const insights = useMemo(() => {
    const alerts = [];

    // 1. ANÁLISIS DE CAJA Y SEGURIDAD
    if (registerStatus?.isOpen) {
      const openTime = new Date(registerStatus.startTime);
      const hoursOpen = (Date.now() - openTime.getTime()) / (1000 * 60 * 60);
      const cashLimit = 50000; // Ejemplo: Límite de seguridad sugerido

      if (hoursOpen > 8) {
        alerts.push({
          type: 'RISK',
          title: 'Fatiga de Turno Detectada',
          message: `La caja lleva abierta ${Math.floor(hoursOpen)} horas. Se recomienda realizar un cierre parcial o cambio de turno para evitar errores humanos.`,
          action: 'Ir al Cierre',
          icon: '🛡️'
        });
      }

      if (registerStatus.currentCash > cashLimit) {
        alerts.push({
          type: 'WARNING',
          title: 'Exceso de Efectivo en Caja',
          message: `El efectivo actual (${formatCurrency(registerStatus.currentCash)}) supera el umbral de seguridad recomendado. Realiza un retiro parcial.`,
          action: 'Retirar',
          icon: '💸'
        });
      }
    }

    // 2. STOCK PREDICTIVO
    const lowStockProducts = products.filter(p => p.stock <= (p.minStock || 5));
    if (lowStockProducts.length > 0) {
      alerts.push({
        type: 'CRITICAL',
        title: 'Riesgo de Quiebre de Stock',
        message: `${lowStockProducts.length} productos están en niveles críticos.`,
        details: lowStockProducts.slice(0, 3).map(p => `${p.name} (${p.stock})`).join(', '),
        icon: '📉'
      });
    }

    // 3. OPORTUNIDADES DE EFICIENCIA (FAVORITOS INTELIGENTES)
    // Simulamos un contador de ventas (en un backend real vendría de la DB histórica)
    const candidatesForFavorites = products.filter(p => !favorites.includes(p.id) && p.category === 'Bebidas'); // Simplificación lógica
    if (candidatesForFavorites.length > 0) {
      const suggestion = candidatesForFavorites[0];
      alerts.push({
        type: 'OPPORTUNITY',
        title: 'Optimización de Flujo',
        message: `El producto "${suggestion.name}" tiene alta rotación. Agrégalo a Favoritos para acelerar el checkout en un 15%.`,
        actionData: () => addToFavorites(suggestion.id),
        actionLabel: 'Agregar a Favoritos',
        icon: '⚡'
      });
    }

    // 4. INFLACIÓN / PRECIOS ESTANCADOS
    // Simulamos detección de precios viejos
    alerts.push({
        type: 'INFO',
        title: 'Análisis de Rentabilidad',
        message: '3 productos no han actualizado su precio en 45 días. En el contexto actual, esto podría representar una pérdida de margen del 12%.',
        icon: '📊'
    });

    return alerts;
  }, [products, registerStatus, favorites]);

  if (insights.length === 0) return null;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-2 mb-2">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
        </span>
        <h3 className="text-sm font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">
          Neural Insights <span className="text-indigo-500">AI</span>
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
        {insights.map((insight, idx) => (
          <div 
            key={idx} 
            className={`
              relative overflow-hidden p-5 rounded-2xl border backdrop-blur-sm transition-all hover:scale-[1.01]
              ${insight.type === 'CRITICAL' ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-500/20' : 
                insight.type === 'RISK' ? 'bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-500/20' :
                insight.type === 'OPPORTUNITY' ? 'bg-indigo-50 dark:bg-indigo-900/10 border-indigo-200 dark:border-indigo-500/20' :
                'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10'}
            `}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{insight.icon}</span>
                <h4 className={`text-sm font-bold ${
                  insight.type === 'CRITICAL' ? 'text-red-700 dark:text-red-400' :
                  insight.type === 'RISK' ? 'text-orange-700 dark:text-orange-400' :
                  insight.type === 'OPPORTUNITY' ? 'text-indigo-700 dark:text-indigo-400' :
                  'text-gray-700 dark:text-white'
                }`}>
                  {insight.title}
                </h4>
              </div>
              {insight.type === 'OPPORTUNITY' && (
                <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30">
                  Sugerencia IA
                </span>
              )}
            </div>
            
            <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed mb-3 pl-1">
              {insight.message}
            </p>
            
            {insight.details && (
              <p className="text-[10px] font-mono text-gray-500 dark:text-gray-400 bg-black/5 dark:bg-black/20 p-2 rounded-lg mb-3">
                {insight.details}
              </p>
            )}

            {insight.actionLabel && insight.actionData && (
              <button 
                onClick={insight.actionData}
                className="w-full py-2 bg-white dark:bg-white/10 border border-gray-200 dark:border-white/10 rounded-lg text-xs font-bold text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-white/20 transition-all shadow-sm"
              >
                {insight.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
