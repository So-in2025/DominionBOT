
export const formatPhoneNumber = (input: string | undefined): string => {
    if (!input) return 'Desconocido';
    
    // Remove JID suffix if present
    const clean = input.split('@')[0].replace(/[^0-9]/g, '');
    
    // Format Argentina/International numbers
    // E.g., 5492615550000 -> +54 9 261 555-0000
    if (clean.startsWith('549') && clean.length >= 13) {
        return `+54 9 ${clean.substring(3, 6)} ${clean.substring(6, 9)}-${clean.substring(9)}`;
    }
    
    // Generic formatting for other lengths
    if (clean.length > 10) {
        return `+${clean.substring(0, 2)} ${clean.substring(2, 6)} ${clean.substring(6)}`;
    }
    
    return `+${clean}`;
};

export const getInitials = (name: string): string => {
    return name
        .split(' ')
        .map(n => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
};
