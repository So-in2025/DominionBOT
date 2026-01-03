
import React, { useState, useEffect, useMemo } from 'react';
import { Testimonial } from '../types';
import TestimonialCard from './TestimonialCard';
import { BACKEND_URL, API_HEADERS, getAuthHeaders } from '../config';

interface TestimonialsCarouselProps {
    isLoggedIn: boolean;
    token: string | null;
    showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const StarInput: React.FC<{ rating: number, setRating: (r: number) => void }> = ({ rating, setRating }) => (
    <div className="flex items-center gap-1">
        {[...Array(5)].map((_, i) => (
            <svg 
                key={i}
                onClick={() => setRating(i + 1)}
                className={`w-6 h-6 cursor-pointer transition-colors ${i < rating ? 'text-brand-gold' : 'text-gray-600 hover:text-brand-gold/50'}`} 
                fill="currentColor" 
                viewBox="0 0 20 20"
            >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
        ))}
    </div>
);

const TestimonialsCarousel: React.FC<TestimonialsCarouselProps> = ({ isLoggedIn, token, showToast }) => {
    const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
    const [newReview, setNewReview] = useState('');
    const [newRating, setNewRating] = useState(5);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const fetchTestimonials = async () => {
        try {
            if (!BACKEND_URL) return;
            const res = await fetch(`${BACKEND_URL}/api/testimonials`, { headers: API_HEADERS });
            if (res.ok) {
                setTestimonials(await res.json());
            } else {
                showToast('Error al cargar testimonios.', 'error');
            }
        } catch (e: any) {
            showToast('Error de red al cargar testimonios.', 'error');
        }
    };
    
    useEffect(() => {
        fetchTestimonials();
    }, []);

    const handleSubmitReview = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newReview.trim() || !token) return;

        setIsSubmitting(true);
        try {
            // NOTE: The backend currently only accepts 'name' and 'text'. 'name' will be derived from user context on the server.
            const res = await fetch(`${BACKEND_URL}/api/testimonials`, {
                method: 'POST',
                headers: getAuthHeaders(token),
                body: JSON.stringify({ text: newReview })
            });
            if (res.ok) {
                showToast('¡Gracias por tu reseña!', 'success');
                setNewReview('');
                setNewRating(5);
                fetchTestimonials(); // Refresh list
            } else {
                showToast('Error al publicar tu reseña.', 'error');
            }
        } catch (e) {
            showToast('Error de red al publicar.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const duplicatedTestimonials = useMemo(() => {
        if (testimonials.length === 0) return [];
        // Ensure there are enough items to create a seamless loop
        if (testimonials.length < 5) {
            return [...testimonials, ...testimonials, ...testimonials, ...testimonials];
        }
        return [...testimonials, ...testimonials]; // Duplicate for smooth infinite scroll
    }, [testimonials]);

    return (
        <section className="bg-brand-black py-20 border-y border-white/5 overflow-hidden w-full relative">
            <div className="absolute top-0 left-0 w-full h-full bg-noise opacity-5"></div>
            <div className="text-center mb-12 max-w-2xl mx-auto px-4">
                <h2 className="text-base font-black leading-7 text-brand-gold uppercase tracking-[0.3em]">Validación Social</h2>
                <p className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">La Confianza de Nuestros Operadores</p>
            </div>

            {duplicatedTestimonials.length > 0 && (
                <div className="group flex flex-nowrap" style={{ willChange: 'transform' }}>
                    <div className="flex animate-scroll group-hover:[animation-play-state:paused] space-x-8 px-4">
                        {duplicatedTestimonials.map((testimonial, index) => (
                            <TestimonialCard key={`${testimonial._id || index}-${index}`} testimonial={testimonial} />
                        ))}
                    </div>
                </div>
            )}

            {isLoggedIn && (
                <div className="max-w-2xl mx-auto mt-20 px-4">
                    <form onSubmit={handleSubmitReview} className="bg-brand-surface border border-white/10 p-6 rounded-2xl space-y-4 animate-fade-in">
                        <h4 className="text-sm font-bold text-white uppercase tracking-wider">Comparte tu experiencia</h4>
                        <StarInput rating={newRating} setRating={setNewRating} />
                        <textarea
                            value={newReview}
                            onChange={e => setNewReview(e.target.value)}
                            placeholder="Tu opinión nos ayuda a mejorar la infraestructura..."
                            className="w-full h-24 bg-black/50 border border-white/10 rounded-xl p-4 text-white text-sm focus:border-brand-gold outline-none resize-none custom-scrollbar"
                            rows={3}
                        />
                        <button type="submit" disabled={isSubmitting || !newReview.trim()} className="w-full py-3 bg-brand-gold text-black rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all disabled:opacity-50 hover:scale-105">
                            {isSubmitting ? 'Publicando...' : 'Publicar Reseña'}
                        </button>
                    </form>
                </div>
            )}
        </section>
    );
};
export default TestimonialsCarousel;
