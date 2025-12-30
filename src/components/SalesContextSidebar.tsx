
import React, { useState } from 'react';
import { Conversation, InternalNote, LeadStatus } from '../types';

interface SalesContextSidebarProps {
  conversation: Conversation;
  onUpdateTags: (tags: string[]) => void;
  onAddNote: (note: string) => void;
  onToggleAiSignals?: (enabled: boolean) => void;
}

const SalesContextSidebar: React.FC<SalesContextSidebarProps> = ({ 
  conversation, 
  onUpdateTags, 
  onAddNote,
  onToggleAiSignals 
}) => {
  const [newTag, setNewTag] = useState('');
  const [newNote, setNewNote] = useState('');

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTag.trim() && !conversation.tags?.includes(newTag.trim())) {
      onUpdateTags([...(conversation.tags || []), newTag.trim().toLowerCase()]);
      setNewTag('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    onUpdateTags(conversation.tags.filter(t => t !== tagToRemove));
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (newNote.trim()) {
      onAddNote(newNote.trim());
      setNewNote('');
    }
  };

  return (
    <aside className="w-72 bg-brand-surface border-l border-white/10 flex flex-col h-full animate-fade-in">
      {/* Header with Human Control Toggle */}
      <div className="p-4 border-b border-white/10 bg-black/20">
        <div className="flex justify-between items-center">
            <div>
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-gold">Sales Context Layer</h3>
                <p className="text-[9px] text-gray-500 mt-0.5 uppercase font-bold">Inteligencia Operativa</p>
            </div>
            <div className="flex flex-col items-end gap-1">
                <span className="text-[8px] font-black text-gray-500 uppercase tracking-tighter">IA Signals</span>
                <button 
                    onClick={() => onToggleAiSignals?.(!conversation.isAiSignalsEnabled)}
                    className={`w-7 h-4 rounded-full relative transition-colors duration-300 ${conversation.isAiSignalsEnabled ? 'bg-brand-gold' : 'bg-gray-700'}`}
                >
                    <div className={`absolute top-0.5 w-3 h-3 bg-black rounded-full transition-all duration-300 ${conversation.isAiSignalsEnabled ? 'left-[16px]' : 'left-0.5'}`}></div>
                </button>
            </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-8 custom-scrollbar">
        
        {/* SIGNAL TAGS */}
        <section>
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Signals</h4>
            <span className="text-[9px] bg-white/5 px-1.5 py-0.5 rounded text-gray-500 font-bold">v2.4.1</span>
          </div>
          
          <div className="flex flex-wrap gap-2 mb-4">
            {conversation.tags?.map(tag => (
              <span key={tag} className="flex items-center gap-1.5 px-2 py-1 rounded bg-brand-gold/10 border border-brand-gold/30 text-brand-gold text-[9px] font-black uppercase tracking-tighter group transition-all hover:border-brand-gold">
                {tag}
                <button onClick={() => removeTag(tag)} className="opacity-40 hover:opacity-100 transition-opacity">✕</button>
              </span>
            ))}
            {(!conversation.tags || conversation.tags.length === 0) && (
              <p className="text-[10px] text-gray-600 italic">No hay señales detectadas.</p>
            )}
          </div>

          <form onSubmit={handleAddTag} className="relative">
            <input 
              type="text" 
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="Confirmar/Añadir señal..."
              className="w-full bg-black/50 border border-white/5 rounded-lg py-2 px-3 text-[10px] text-white focus:border-brand-gold outline-none font-bold placeholder-gray-700"
            />
          </form>
        </section>

        {/* INTERNAL NOTES */}
        <section className="flex-1 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Internal Notes</h4>
          </div>

          <div className="space-y-4 mb-6">
            {conversation.internalNotes?.slice().reverse().map(note => (
              <div key={note.id} className={`p-3 border rounded-xl space-y-2 ${note.author === 'AI' ? 'bg-brand-gold/5 border-brand-gold/20' : 'bg-white/5 border-white/5'}`}>
                <div className="flex justify-between items-center">
                   <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${note.author === 'AI' ? 'bg-brand-gold text-black' : 'bg-blue-500 text-white'}`}>
                    {note.author}
                   </span>
                   <span className="text-[8px] text-gray-600 font-mono">
                    {new Date(note.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                   </span>
                </div>
                <p className="text-[10px] text-gray-300 leading-relaxed font-medium whitespace-pre-line">
                  {note.note}
                </p>
              </div>
            ))}
            {(!conversation.internalNotes || conversation.internalNotes.length === 0) && (
              <p className="text-[10px] text-gray-600 italic text-center py-4">Sin notas internas.</p>
            )}
          </div>

          <form onSubmit={handleAddNote} className="sticky bottom-0 bg-brand-surface pt-2">
            <textarea 
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Nueva nota de seguimiento..."
              className="w-full bg-black/50 border border-white/5 rounded-xl p-3 text-[10px] text-white focus:border-brand-gold outline-none h-24 resize-none font-medium placeholder-gray-700"
            />
            <button 
              type="submit"
              disabled={!newNote.trim()}
              className="w-full mt-2 py-2 bg-white/10 border border-white/10 text-gray-400 text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-brand-gold hover:text-black hover:border-brand-gold transition-all"
            >
              Guardar Nota
            </button>
          </form>
        </section>

      </div>
      
      <div className="p-4 bg-black/20 border-t border-white/10">
        <p className="text-[8px] text-gray-600 font-bold uppercase tracking-widest leading-relaxed">
          Ordenando decisiones comerciales • v2.4.1
        </p>
      </div>
    </aside>
  );
};

export default SalesContextSidebar;
