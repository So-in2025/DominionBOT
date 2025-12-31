
import React, { useState } from 'react';
import { Conversation, InternalNote, LeadStatus } from '../types';

interface SalesContextSidebarProps {
  conversation: Conversation;
  onUpdateTags: (tags: string[]) => void;
  onAddNote: (note: string) => void;
  onUpdateConversation?: (id: string, updates: Partial<Conversation>) => void;
}

const SalesContextSidebar: React.FC<SalesContextSidebarProps> = ({ 
  conversation, 
  onUpdateTags, 
  onAddNote,
  onUpdateConversation 
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

  const markAsPersonal = () => {
      if (confirm("¿Marcar este chat como PERSONAL? El bot se desactivará para siempre aquí.")) {
          onUpdateConversation?.(conversation.id, { 
              status: LeadStatus.PERSONAL, 
              isBotActive: false,
              isMuted: true
          });
      }
  };

  return (
    <aside className="w-72 bg-brand-surface border-l border-white/10 flex flex-col h-full animate-fade-in shadow-2xl">
      <div className="p-4 border-b border-white/10 bg-black/20">
        <div className="flex justify-between items-center">
            <div>
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-gold">Context Layer</h3>
                <p className="text-[9px] text-gray-500 mt-0.5 font-bold">OPERACIONES</p>
            </div>
            
            <button 
                onClick={markAsPersonal}
                className={`px-2 py-1 rounded text-[8px] font-black uppercase border transition-all ${conversation.status === LeadStatus.PERSONAL ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'bg-white/5 border-white/10 text-gray-500 hover:text-white hover:border-blue-500/50'}`}
            >
                {conversation.status === LeadStatus.PERSONAL ? 'CONTACTO PERSONAL' : 'MARCAR PERSONAL'}
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-8 custom-scrollbar">
        
        <section>
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Signals</h4>
          </div>
          
          <div className="flex flex-wrap gap-2 mb-4">
            {conversation.tags?.map(tag => (
              <span key={tag} className="flex items-center gap-1.5 px-2 py-1 rounded bg-brand-gold/10 border border-brand-gold/30 text-brand-gold text-[9px] font-black uppercase tracking-tighter">
                {tag}
                <button onClick={() => removeTag(tag)} className="opacity-40 hover:opacity-100">✕</button>
              </span>
            ))}
          </div>

          <form onSubmit={handleAddTag} className="relative">
            <input 
              type="text" value={newTag} onChange={(e) => setNewTag(e.target.value)}
              placeholder="Añadir señal..."
              className="w-full bg-black/50 border border-white/5 rounded-lg py-2 px-3 text-[10px] text-white focus:border-brand-gold outline-none"
            />
          </form>
        </section>

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
                <p className="text-[10px] text-gray-300 leading-relaxed font-medium whitespace-pre-line">{note.note}</p>
              </div>
            ))}
          </div>

          <form onSubmit={handleAddNote} className="sticky bottom-0 bg-brand-surface pt-2">
            <textarea 
              value={newNote} onChange={(e) => setNewNote(e.target.value)}
              placeholder="Nota de seguimiento..."
              className="w-full bg-black/50 border border-white/5 rounded-xl p-3 text-[10px] text-white focus:border-brand-gold outline-none h-24 resize-none"
            />
            <button 
              type="submit" disabled={!newNote.trim()}
              className="w-full mt-2 py-2 bg-white/10 text-gray-400 text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-brand-gold hover:text-black transition-all"
            >
              Guardar Nota
            </button>
          </form>
        </section>
      </div>
    </aside>
  );
};

export default SalesContextSidebar;
