import React from 'react';
import {createRoot} from 'react-dom/client';
import Dashboard from '../shared/app/dashboard';
import './site.css';
import '../shared/app/sections.css';
import '../shared/app/atelier.css';
import '../shared/app/clarity.css';
createRoot(document.getElementById('root')!).render(<Dashboard/>);
