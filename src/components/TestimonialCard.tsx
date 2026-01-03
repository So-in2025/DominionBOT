
import React from 'react';
import { Testimonial } from '../types';

function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return `ahora`;
  
  let interval = seconds / 31536000;
  if (interval > 1) {
    const years = Math.floor(interval);
    return `hace ${years} ${years > 1 ? 'años' : 'año'}`;
  }
  interval = seconds / 2592000;
  if (interval > 1) {
    const months = Math.floor(interval);
    return `hace ${months} ${months > 1 ? 'meses' : 'mes'}`;
  }
  interval = seconds / 86400;
  if (interval > 1) {
    const days = Math.floor(interval);
    return `hace ${days} ${days > 1 ? 'días' : 'día'}`;
  }
  interval = seconds / 3600;
  if (interval > 1) {
    const hours = Math.floor(interval);
    return `hace ${hours} ${hours > 1 ? 'horas' : 'hora'}`;
  }
  interval = seconds / 60;
  if (interval > 1) {
    const minutes = Math.floor(interval);
    return `hace ${minutes} ${minutes > 1 ? 'minutos' : 'minuto'}`;
  }
  return `hace segundos`;
}


const Star: React.FC<{ filled: boolean }> = ({ filled }) => (
    <svg className={`w-4 h-4 ${filled ? 'text-brand-gold' : 'text-gray-700'}`} fill="currentColor" viewBox="0 0 20 20">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
);

const StarRating: React.FC<{ rating: number }> = ({ rating }) => (
    <div className="flex">
        {[...Array(5)].map((_, i) => <Star key={i} filled={i < rating} />)}
    </div>
);

const TestimonialCard: React.FC<{ testimonial: Testimonial }> = ({ testimonial }) => {
    // Generate a consistent pseudo-random rating based on user ID to avoid flicker on re-render.
    const pseudoRandomRating = (testimonial.userId.charCodeAt(5) || 5) % 2 + 4; // 4 or 5

    return (
        <div className="flex flex-col flex-shrink-0 w-80 md:w-96 bg-brand-surface border border-white/10 rounded-2xl p-6 transition-all duration-300 hover:border-brand-gold hover:-translate-y-1 group">
            <div className="flex items-center mb-4">
                <StarRating rating={pseudoRandomRating} />
            </div>
            <p className="text-gray-300 text-sm leading-relaxed mb-6 flex-1 min-h-[100px]">
                <span className="text-brand-gold text-xl font-black mr-1">“</span>
                {testimonial.text}
            </p>
            <div className="flex justify-between items-center text-xs border-t border-white/5 pt-4 mt-auto">
                <div>
                    <p className="font-bold text-white group-hover:text-brand-gold transition-colors">{testimonial.name}</p>
                    <p className="text-gray-500">{testimonial.location}</p>
                </div>
                <p className="text-gray-500 font-mono">{timeAgo(testimonial.createdAt)}</p>
            </div>
        </div>
    );
};

export default TestimonialCard;
