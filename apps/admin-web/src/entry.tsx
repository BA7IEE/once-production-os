// Keep anonymous portfolio loading independent of the internal management bundle.
if(location.pathname.startsWith('/p/'))void import('./professional-homepage-entry.tsx');
else void import('./main.tsx');
