import {createRoot} from 'react-dom/client';
import {PublicProfessionalHomepage} from './professional-homepage-view.tsx';
document.body.classList.add('public-homepage-body');
createRoot(document.getElementById('root')!).render(<PublicProfessionalHomepage/>);
