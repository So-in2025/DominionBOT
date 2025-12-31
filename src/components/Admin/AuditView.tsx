
import React, { useState } from 'react';
import { User, PlanType, PlanStatus } from '../../types';
import { getAuthHeaders } from '../../config';
import { BACKEND_URL } from '../../config';

interface ClientManagementViewProps {
    user: User;
    onClose: () => void;
    onUpdate: (updatedUser: User) => void;
    showToast: (message: string, type: 'success' | 'error') => void;
}

const ClientManagementView: React.FC<ClientManagementViewProps> = ({ user, onClose, onUpdate, showToast }) => {
    const [clientData, setClientData] = useState<User>(user);
    const [isSaving, setIsSaving] = useState(false);

    const handleInputChange = (field: keyof User, value: any) => {
        setClientData(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const token = localStorage.getItem('saas_token');
            const updatePayload = {
                plan_type: clientData.plan_type,
                plan_status: clientData.plan_status,
                business_name: clientData.business_name,
            };

            const res = await fetch(`${BACKEND_URL}/api/admin/clients/${clientData.id}`, {
                method: 'PUT',
                headers: getAuthHeaders(token!),
                body: JSON.stringify(updatePayload)
            });
            if(res.ok) {
                const updated = await res.json();
                onUpdate(updated);
                showToast('Cliente actualizado correctamente.', 'success');
            } else {
                showToast('Error al actualizar el cliente.', 'error');
            }
        } catch(e) {
            showToast('Error de conexión con el servidor.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleActivate = async () => {
        if (!window.confirm(`¿Activar la licencia PRO para ${clientData.business_name} por 30 días?`)) return;
        setIsSaving(true);
        try {
            const token = localStorage.getItem('saas_token');
            const res = await fetch(`${BACKEND_URL}/api/admin/clients/${clientData.id}/activate`, {
                method: 'POST',
                headers: getAuthHeaders(token!),
            });
            if(res.ok) {
                const updated = await res.json();
                setClientData(updated); // Update local state
                onUpdate(updated); // Update parent state
                showToast('Licencia activada por 30 días.', 'success');
            } else {
                showToast('Error al activar la licencia.', 'error');
            }
        } catch(e) {
            showToast('Error de conexión con el servidor.', 'error');
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleRenew = async () => {
        if (!window.confirm(`¿Renovar el plan para ${clientData.username} por 30 días?`)) return;
        setIsSaving(true);
        try {
            const token = localStorage.getItem('saas_token');
            const res = await fetch(`${BACKEND_URL}/api/admin/clients/${clientData.id}/renew`, {
                method: 'POST',
                headers: getAuthHeaders(token!),
            });
             if(res.ok) {
                const updated = await res.json();
                setClientData(updated);
                onUpdate(updated);
                showToast('Plan renovado por 30 días.', 'success');
            } else {
                showToast('Error al renovar el plan.', 'error');
            }
        } catch(e) {
            showToast('Error de conexión con el servidor.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const showActivateButton = clientData.plan_status === 'trial' || clientData.plan_status === 'expired';

    return (
        <div className="flex-1 bg-brand-black flex flex-col h-full overflow-hidden animate-fade-in font-sans p-8">
            <div className="bg-brand-gold text-black px-6 py-2 flex justify-between items-center shadow-lg z-20 mb-8 rounded-lg">
                <h2 className="text-sm font-black uppercase tracking-widest">Gestionando a: {user.business_name}</h2>
                <button onClick={onClose} className="text-xs font-black uppercase tracking-widest hover:underline">Cerrar</button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar bg-brand-surface p-8 rounded-2xl border border-white/5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                        <h3 className="text-brand-gold font-black uppercase tracking-widest text-xs">Información del Cliente</h3>
                        
                        <div>
                            <label className="text-xs font-bold text-gray-400">Nombre Visible</label>
                            <input 
                                value={clientData.business_name} 
                                onChange={e => handleInputChange('business_name', e.target.value)}
                                className="w-full mt-1 p-2 bg-white/5 rounded text-white"
                            />
                        </div>

                        <p><strong>ID:</strong> <span className="font-mono text-gray-400">{clientData.id}</span></p>
                        <p><strong>WhatsApp (Login):</strong> <span className="font-mono text-gray-400">{clientData.username}</span></p>
                        <p><strong>Fecha de Creación:</strong> <span className="font-mono text-gray-400">{new Date(clientData.created_at).toLocaleString()}</span></p>
                        <p><strong>Última Actividad:</strong> <span className="font-mono text-gray-400">{clientData.last_activity_at ? new Date(clientData.last_activity_at).toLocaleString() : 'N/A'}</span></p>
                    </div>

                    <div className="space-y-6 bg-black/40 p-6 rounded-lg border border-white/5">
                        <h3 className="text-brand-gold font-black uppercase tracking-widest text-xs">Gestión de Plan y Facturación</h3>
                        
                        <div>
                            <label className="text-xs font-bold text-gray-400">Tipo de Plan</label>
                            <select value={clientData.plan_type} onChange={e => handleInputChange('plan_type', e.target.value as PlanType)} className="w-full mt-1 p-2 bg-white/5 rounded text-white">
                                <option value="starter">Starter</option>
                                <option value="pro">Pro</option>
                            </select>
                        </div>
                        
                        <div>
                            <label className="text-xs font-bold text-gray-400">Estado del Plan</label>
                            <select value={clientData.plan_status} onChange={e => handleInputChange('plan_status', e.target.value as PlanStatus)} className="w-full mt-1 p-2 bg-white/5 rounded text-white">
                                <option value="trial">Prueba</option>
                                <option value="active">Activo</option>
                                <option value="expired">Expirado</option>
                                <option value="suspended">Suspendido</option>
                            </select>
                        </div>
                        
                        <div>
                            <p><strong>Vencimiento Actual:</strong> <span className="font-mono text-gray-400">{new Date(clientData.billing_end_date).toLocaleDateString()}</span></p>
                        </div>

                        <div className="flex flex-col gap-4 pt-4">
                            {showActivateButton && (
                                <button onClick={handleActivate} disabled={isSaving} className="w-full py-3 bg-green-600 text-white font-bold text-xs rounded uppercase hover:bg-green-500 disabled:opacity-50 shadow-lg">
                                    Activar Licencia (30 Días)
                                </button>
                            )}
                            <div className="flex gap-4">
                               <button onClick={handleSave} disabled={isSaving} className="flex-1 py-3 bg-white/10 text-white font-bold text-xs rounded uppercase hover:bg-white/20 disabled:opacity-50">Guardar Cambios</button>
                               <button onClick={handleRenew} disabled={isSaving || showActivateButton} className="flex-1 py-3 bg-brand-gold text-black font-bold text-xs rounded uppercase hover:opacity-80 disabled:opacity-50 disabled:bg-gray-600 disabled:text-gray-400">Renovar Plan</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ClientManagementView;
