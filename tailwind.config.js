
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./App.tsx"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        brand: {
          // --- LUXURY PALETTE (New) ---
          gold: '#D4AF37',       
          'gold-light': '#F9DF74', 
          'gold-dark': '#997B19',  
          black: '#050505',      
          surface: '#121212',    
          'dark-glass': 'rgba(10, 10, 10, 0.6)',

          // --- COMPATIBILITY MAPPING (Fixes "No Boxes/No Backgrounds") ---
          // Mapping legacy classes to the new luxury colors
          primary: '#D4AF37',   // Was Blue, now Gold
          secondary: '#121212', // Was Dark Grey, now Matte Black Surface
          dark: '#050505',      // Was Black, now Deep Black
          light: '#333333',     // Borders/Separators
          accent: '#F9DF74',    // Highlights
        },
      },
      animation: {
        'blob': 'blob 10s infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'fade-in': 'fadeIn 0.8s ease-out forwards',
        'float': 'float 6s ease-in-out infinite',
      },
      backgroundImage: {
        'gold-gradient': 'linear-gradient(135deg, #997B19 0%, #D4AF37 50%, #F9DF74 100%)',
        'luxury-mesh': 'radial-gradient(at 0% 0%, hsla(253,16%,7%,1) 0, transparent 50%), radial-gradient(at 50% 0%, hsla(225,39%,30%,1) 0, transparent 50%), radial-gradient(at 100% 0%, hsla(339,49%,30%,1) 0, transparent 50%)',
      },
      keyframes: {
        blob: {
          '0%': { transform: 'translate(0px, 0px) scale(1)' },
          '33%': { transform: 'translate(30px, -50px) scale(1.1)' },
          '66%': { transform: 'translate(-20px, 20px) scale(0.9)' },
          '100%': { transform: 'translate(0px, 0px) scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' }
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        }
      }
    },
  },
  plugins: [],
}
