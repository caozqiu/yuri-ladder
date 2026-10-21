import React from 'react';
import {createRoot} from 'react-dom/client';
import Dashboard from '../shared/app/dashboard';
import './site.css';
createRoot(document.getElementById('root')!).render(<Dashboard/>);
