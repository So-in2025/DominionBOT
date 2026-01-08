
import React, { useState } from 'react';
import { Product } from '../../types';
import { usePOS } from '../../context/POSContext';
import { formatCurrency } from '../../utils/currency';
import { ProductModal } from '../modals/ProductModal'; // Asegúrate de que la ruta sea correcta

export const ProductList: React.FC = () => {
  const { products, addToCart, addToFavorites, favorites, deleteProduct } = usePOS();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  
  // ESTADO DE COMPARACIÓN SEGURO
  const [selectedForComparison, setSelectedForComparison] = useState<string[]>([]);
  const [showComparison, setShowComparison] = useState(false);

  // Derivados
  const categories = ['Todos', ...Array.from(new Set(products.map(p => p.category)))];
  
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'Todos' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // MANEJADOR SEGURO DE COMPARACIÓN (CRASH FIX)
  const handleToggleCompare = (id: string | number) => {
    // Convertimos a string para consistencia, ya que los IDs pueden venir como número o string
    const stringId = String(id);
    
    // Verificamos si el producto realmente existe en la lista actual antes de agregarlo
    const productExists = products.some(p => String(p.id) === stringId);
    if (!productExists) return;

    setSelectedForComparison(prev => {
      // Defensive check: prev is sometimes undefined in rare re-renders if logic is bad elsewhere
      const currentSelection = prev || []; 
      
      if (currentSelection.includes(stringId)) {
        return currentSelection.filter(item => item !== stringId);
      } else {
        if (currentSelection.length >= 3) {
          alert('Máximo 3 productos para comparar');
          return currentSelection;
        }
        return [...currentSelection, stringId];
      }
    });
  };

  const productsToCompare = products.filter(p => selectedForComparison.includes(String(p.id)));

  return (
    <div className="bg-brand-surface border border-white/5 rounded-[24px] p-6 shadow-2xl flex flex-col h-full animate-fade-in relative">
      
      {/* Header & Filters */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-black text-white uppercase tracking-widest">Catálogo</h2>
          <span className="text-xs text-gray-500 font-bold">{filteredProducts.length} items</span>
        </div>
        
        <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border ${
                selectedCategory === cat 
                ? 'bg-brand-gold text-black border-brand-gold' 
                : 'bg-black/40 text-gray-500 border-transparent hover:text-white hover:border-white/10'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Buscar productos..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-brand-gold outline-none transition-all placeholder-gray-600"
        />
      </div>

      {/* Product Grid */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredProducts.map(product => (
            <div 
              key={product.id} 
              className={`group bg-black/20 border rounded-2xl overflow-hidden transition-all duration-300 hover:-translate-y-1 ${
                selectedForComparison.includes(String(product.id)) 
                ? 'border-brand-gold ring-1 ring-brand-gold bg-brand-gold/5' 
                : 'border-white/5 hover:border-white/20'
              }`}
            >
              <div className="relative aspect-square bg-white/5 overflow-hidden">
                {product.image ? (
                  <img src={product.image} alt={product.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-700 font-black text-2xl bg-gradient-to-br from-white/5 to-transparent">
                    {product.name.charAt(0)}
                  </div>
                )}
                
                {/* Actions Overlay */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3 gap-2">
                  <button 
                    onClick={() => setSelectedProduct(product)}
                    className="w-full py-2 bg-white text-black rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-brand-gold transition-colors"
                  >
                    Ver Detalle
                  </button>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => addToFavorites(product.id)}
                      className={`flex-1 py-2 rounded-lg text-lg flex items-center justify-center transition-colors ${favorites.includes(product.id) ? 'bg-red-500 text-white' : 'bg-white/20 text-white hover:bg-white/40'}`}
                    >
                      ♥
                    </button>
                    <label className="flex-1 flex items-center justify-center bg-white/20 hover:bg-white/40 rounded-lg cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="w-4 h-4 accent-brand-gold cursor-pointer"
                        checked={selectedForComparison.includes(String(product.id))}
                        onChange={() => handleToggleCompare(product.id)}
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="p-3">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="text-xs font-bold text-white truncate pr-2" title={product.name}>{product.name}</h3>
                  <span className="text-[10px] text-gray-500 font-mono">x{product.stock}</span>
                </div>
                <p className="text-sm font-black text-brand-gold">{formatCurrency(product.price)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Floating Comparison Bar */}
      {selectedForComparison.length > 0 && (
        <div className="absolute bottom-6 left-6 right-6 bg-brand-surface/95 backdrop-blur-md border border-brand-gold/30 rounded-2xl p-4 flex justify-between items-center shadow-2xl animate-slide-in-right z-20">
          <div className="flex items-center gap-4">
            <div className="flex -space-x-2">
              {productsToCompare.map(p => (
                <div key={p.id} className="w-10 h-10 rounded-full border-2 border-brand-surface bg-gray-800 flex items-center justify-center text-xs font-bold text-white overflow-hidden" title={p.name}>
                  {p.image ? <img src={p.image} className="w-full h-full object-cover" /> : p.name.charAt(0)}
                </div>
              ))}
            </div>
            <span className="text-xs font-bold text-white uppercase tracking-wider">{selectedForComparison.length} productos</span>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setSelectedForComparison([])}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-400 rounded-lg text-[9px] font-black uppercase tracking-widest"
            >
              Cancelar
            </button>
            <button 
              onClick={() => setShowComparison(true)}
              className="px-4 py-2 bg-brand-gold text-black rounded-lg text-[9px] font-black uppercase tracking-widest hover:scale-105 transition-transform"
            >
              Comparar
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      <ProductModal 
        product={selectedProduct} 
        isOpen={!!selectedProduct} 
        onClose={() => setSelectedProduct(null)} 
        onAddToCart={(p, q, v) => addToCart(p, q, v)} 
      />

      {/* Comparison Overlay (Simple Implementation) */}
      {showComparison && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-brand-surface w-full max-w-4xl rounded-3xl border border-white/10 p-8 shadow-2xl animate-fade-in relative">
            <button onClick={() => setShowComparison(false)} className="absolute top-6 right-6 text-gray-500 hover:text-white">✕</button>
            <h2 className="text-2xl font-black text-white uppercase tracking-widest mb-8">Tabla Comparativa</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {productsToCompare.map(p => (
                <div key={p.id} className="bg-black/40 border border-white/5 rounded-2xl p-6 flex flex-col gap-4">
                  <div className="h-40 bg-white/5 rounded-xl overflow-hidden mb-2">
                     {p.image ? <img src={p.image} className="w-full h-full object-cover" /> : null}
                  </div>
                  <h3 className="text-lg font-bold text-white">{p.name}</h3>
                  <div className="space-y-2 text-sm text-gray-400">
                    <p className="flex justify-between border-b border-white/5 pb-2"><span>Precio</span> <span className="text-brand-gold font-bold">{formatCurrency(p.price)}</span></p>
                    <p className="flex justify-between border-b border-white/5 pb-2"><span>Stock</span> <span className="text-white">{p.stock} u.</span></p>
                    <p className="flex justify-between border-b border-white/5 pb-2"><span>Categoría</span> <span className="text-white">{p.category}</span></p>
                    {/* Mocked Inflation Data for demo */}
                    <p className="flex justify-between border-b border-white/5 pb-2"><span>Var. 30d</span> <span className="text-green-400">+5%</span></p>
                  </div>
                  <button onClick={() => { addToCart(p, 1); setShowComparison(false); }} className="w-full py-3 bg-white/10 hover:bg-brand-gold hover:text-black text-white rounded-lg text-xs font-black uppercase tracking-widest transition-all mt-auto">
                    Vender
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
