
import React, { useState, useEffect } from 'react';
import { usePOS } from '../../context/POSContext';
import { formatCurrency } from '../../utils/currency';

interface RegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'open' | 'close';
}

export const RegisterModal: React.FC<RegisterModalProps> = ({ isOpen, onClose, type }) => {
  const { openRegister, closeRegister, registerStatus } = usePOS();
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [countedCash, setCountedCash] = useState('');
  const [countedCard, setCountedCard] = useState('');

  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setNotes('');
      setCountedCash('');
      setCountedCard('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (type === 'open') {
      openRegister(parseFloat(amount) || 0, notes);
    } else {
      closeRegister({
        cash: parseFloat(countedCash) || 0,
        card: parseFloat(countedCard) || 0,
        notes
      });
    }
    onClose();
  };

  const expectedCash = registerStatus?.currentCash || 0;
  // Simulación de ventas con tarjeta (en una app real vendría del estado)
  const expectedCard = registerStatus?.salesRaw?.reduce((acc, sale) => sale.paymentMethod === 'card' ? acc + sale.total : acc, 0) || 0;
  
  const difference = (parseFloat(countedCash) || 0) - expectedCash;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-300">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-gray-100 dark:border-white/10 flex flex-col transform transition-all scale-100">
        
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/5 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {type === 'open' ? 'Apertura de Caja' : 'Cierre de Turno'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {type === 'open' ? 'Inicia las operaciones del día' : 'Arqueo y cierre de operaciones'}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          
          {type === 'open' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Fondo Inicial (Base)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-3.5 text-gray-400">$</span>
                  <input
                    type="number"
                    required
                    step="0.01"
                    className="w-full bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-xl py-3 pl-8 pr-4 text-lg font-semibold text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Resumen Esperado */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-500/20">
                  <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Efectivo Esperado</span>
                  <div className="text-2xl font-bold text-indigo-900 dark:text-indigo-100 mt-1">{formatCurrency(expectedCash)}</div>
                </div>
                <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-500/20">
                  <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider">Tarjeta Esperada</span>
                  <div className="text-2xl font-bold text-purple-900 dark:text-purple-100 mt-1">{formatCurrency(expectedCard)}</div>
                </div>
              </div>

              {/* Inputs de Conteo */}
              <div className="space-y-4">
                <div className="relative">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1.5 ml-1">Efectivo Real en Caja</label>
                  <div className="relative group">
                    <span className="absolute left-4 top-3.5 text-gray-400 group-focus-within:text-indigo-500 transition-colors">$</span>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-xl py-3 pl-8 pr-4 text-gray-900 dark:text-white font-mono text-lg focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all"
                      placeholder="0.00"
                      value={countedCash}
                      onChange={(e) => setCountedCash(e.target.value)}
                    />
                  </div>
                  {countedCash && (
                    <div className={`text-xs mt-1.5 font-medium text-right ${difference === 0 ? 'text-emerald-500' : difference > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      Diferencia: {difference > 0 ? '+' : ''}{formatCurrency(difference)}
                    </div>
                  )}
                </div>

                <div className="relative">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1.5 ml-1">Comprobantes Tarjeta</label>
                  <div className="relative group">
                    <span className="absolute left-4 top-3.5 text-gray-400 group-focus-within:text-purple-500 transition-colors">$</span>
                    <input
                      type="number"
                      step="0.01"
                      className="w-full bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-xl py-3 pl-8 pr-4 text-gray-900 dark:text-white font-mono text-lg focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 outline-none transition-all"
                      placeholder="0.00"
                      value={countedCard}
                      onChange={(e) => setCountedCard(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Notas / Observaciones
            </label>
            <textarea
              rows={3}
              className="w-full bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-xl py-3 px-4 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all resize-none"
              placeholder="Ej: Faltante justificado por..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3.5 rounded-xl border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-white/5 transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-500/30 active:scale-95 transition-all"
            >
              {type === 'open' ? 'Abrir Caja' : 'Cerrar Turno'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
