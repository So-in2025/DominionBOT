
import React, { useState, useEffect } from 'react';
import { Product } from '../../types';
import { formatCurrency } from '../../utils/currency';

interface ProductModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (product: Product, quantity: number, variant?: any) => void;
}

export const ProductModal: React.FC<ProductModalProps> = ({ product, isOpen, onClose, onAddToCart }) => {
  const [quantity, setQuantity] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState<any>(null);

  useEffect(() => {
    if (isOpen && product) {
      setQuantity(1);
      // Seleccionar primera variante por defecto si existe
      setSelectedVariant(product.variants && product.variants.length > 0 ? product.variants[0] : null);
    }
  }, [isOpen, product]);

  if (!isOpen || !product) return null;

  const currentPrice = selectedVariant ? selectedVariant.price : product.price;
  const totalPrice = currentPrice * quantity;

  const handleAddToCart = () => {
    onAddToCart(product, quantity, selectedVariant);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-gray-100 dark:border-white/10 flex flex-col md:flex-row max-h-[85vh]">
        
        {/* Left: Image */}
        <div className="md:w-2/5 bg-gray-100 dark:bg-black/20 relative h-48 md:h-auto">
          {product.image ? (
            <img 
              src={product.image} 
              alt={product.name} 
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-white/10">
              <svg className="w-24 h-24" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            </div>
          )}
          <button 
            onClick={onClose}
            className="absolute top-4 left-4 p-2 bg-black/20 hover:bg-black/40 text-white rounded-full backdrop-blur-md transition-colors md:hidden"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Right: Details */}
        <div className="md:w-3/5 p-8 flex flex-col bg-white dark:bg-slate-900 relative">
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 transition-colors hidden md:block"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>

          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 pr-8">{product.name}</h2>
            <div className="text-3xl font-black text-indigo-600 dark:text-indigo-400 mb-6">
              {formatCurrency(currentPrice)}
            </div>

            {/* Variants */}
            {product.variants && product.variants.length > 0 && (
              <div className="mb-8">
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 block">
                  Variantes
                </label>
                <div className="flex flex-wrap gap-2">
                  {product.variants.map((variant, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedVariant(variant)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                        selectedVariant === variant
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-600 dark:text-white dark:border-transparent ring-2 ring-indigo-500/20'
                          : 'border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:border-indigo-300 dark:hover:border-white/30'
                      }`}
                    >
                      {variant.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quantity */}
            <div className="mb-8">
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 block">
                Cantidad
              </label>
              <div className="flex items-center gap-4">
                <div className="flex items-center bg-gray-100 dark:bg-white/5 rounded-xl p-1 border border-gray-200 dark:border-white/10">
                  <button 
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-10 h-10 flex items-center justify-center bg-white dark:bg-white/10 rounded-lg shadow-sm text-gray-600 dark:text-white hover:text-indigo-600 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
                  </button>
                  <span className="w-12 text-center font-bold text-lg text-gray-900 dark:text-white">{quantity}</span>
                  <button 
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-10 h-10 flex items-center justify-center bg-white dark:bg-white/10 rounded-lg shadow-sm text-gray-600 dark:text-white hover:text-indigo-600 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="pt-6 mt-4 border-t border-gray-100 dark:border-white/10">
            <button
              onClick={handleAddToCart}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-lg shadow-lg shadow-indigo-500/30 active:scale-95 transition-all flex items-center justify-between px-6"
            >
              <span>Agregar al Carrito</span>
              <span className="bg-white/20 px-2 py-1 rounded text-sm">
                {formatCurrency(totalPrice)}
              </span>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
