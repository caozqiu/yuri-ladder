import React from 'react';
import {createRoot} from 'react-dom/client';
import Dashboard from '../shared/app/dashboard';
import './site.css';
import '../shared/app/sections.css';
createRoot(document.getElementById('root')!).render(<Dashboard/>);
