

import React from 'react';
import { usePOS } from '../../context/POSContext';
import { formatCurrency } from '../../utils/currency';
import { formatDistanceToNow } from 'date-fns';
import es from 'date-fns/locale/es';

interface ParkedSalesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ParkedSalesModal: React.FC<ParkedSalesModalProps> = ({ isOpen, onClose }) => {
  const { parkedSales, resumeSale, discardParkedSale } = usePOS();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-gray-100 dark:border-white/10 flex flex-col max-h-[85vh]">
        
        <div className="px-8 py-6 border-b border-gray-100 dark:border-white/5 flex justify-between items-center bg-gray-50/80 dark:bg-white/5 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 rounded-lg">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Ventas Aparcadas</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">{parkedSales.length} ventas en espera</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-white/10 text-gray-500 transition-colors">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50 dark:bg-black/20">
          {parkedSales.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 opacity-60">
              <svg className="w-16 h-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <p className="text-lg font-medium">No hay ventas aparcadas</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {parkedSales.map((sale) => (
                <div 
                  key={sale.id} 
                  className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-500/30 transition-all group"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-sm">
                        #{String(sale.id).slice(-3)}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {sale.customerName || 'Cliente General'}
                        </h3>
                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          {formatDistanceToNow(new Date(sale.date), { addSuffix: true, locale: es })}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="block text-lg font-bold text-indigo-600 dark:text-indigo-400">
                        {formatCurrency(sale.total)}
                      </span>
                      <span className="text-xs text-gray-400">{sale.items.length} productos</span>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                      {sale.items.slice(0, 4).map((item, idx) => (
                        <span key={idx} className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {item.quantity}x {item.name}
                        </span>
                      ))}
                      {sale.items.length > 4 && (
                        <span className="inline-flex items-center px-2 py-1 text-xs text-gray-400">
                          +{sale.items.length - 4} más
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3 pt-3 border-t border-gray-100 dark:border-white/5">
                    <button
                      onClick={() => {
                        discardParkedSale(sale.id);
                        if (parkedSales.length === 1) onClose();
                      }}
                      className="flex-1 px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-lg transition-colors"
                    >
                      Descartar
                    </button>
                    <button
                      onClick={() => {
                        resumeSale(sale.id);
                        onClose();
                      }}
                      className="flex-[2] px-4 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-lg shadow-indigo-500/20 active:scale-95 transition-all"
                    >
                      Retomar Venta
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
