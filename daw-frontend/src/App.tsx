import { useState } from 'react';
import Chapter2b from './chapters/Chapter2b';
import Chapter3 from './chapters/Chapter3';
import Chapter4 from './chapters/Chapter4';
import Chapter6 from './chapters/Chapter6';
import Chapter7 from './chapters/Chapter7';
import Chapter9 from './chapters/Chapter9';
import Chapter10 from './chapters/Chapter10';
import Chapter11 from './chapters/Chapter11';
import Chapter12 from './chapters/Chapter12';
import './App.css';

const TABS = [
  {
    id: 'paramEQ',
    label: 'ParamEQ',
    title: 'ParamEQ — Full Parametric Curve',
    Component: Chapter2b,
  },
  {
    id: 'gate',
    label: 'Gate',
    title: 'Silence the Noise Floor',
    Component: Chapter10,
  },
  {
    id: 'deEsser',
    label: 'De-Esser',
    title: 'De-Esser',
    Component: Chapter12,
  },
  {
    id: 'compressor',
    label: 'Compressor',
    title: 'Shape the Dynamic Range',
    Component: Chapter4,
  },
  {
    id: 'saturation',
    label: 'Saturation',
    title: 'Add Warmth with Saturation',
    Component: Chapter7,
  },
  {
    id: 'reverb',
    label: 'Reverb',
    title: 'Design a Reverb Space',
    Component: Chapter6,
  },
  {
    id: 'delay',
    label: 'Delay',
    title: 'Shape Character with Modulated, Filtered Delay',
    Component: Chapter9,
  },
  {
    id: 'limiter',
    label: 'Limiter',
    title: 'Set a Brickwall Ceiling with a Limiter',
    Component: Chapter11,
  },
  {
    id: 'mixer',
    label: 'Mixer',
    title: 'Balance a Six-Track Session',
    Component: Chapter3,
  },
] as const;

export default function App() {
  const [activeTab, setActiveTab] = useState<string>(TABS[0].id);
  const active = TABS.find((t) => t.id === activeTab) ?? TABS[0];
  const { Component } = active;

  return (
    <div className="soundcraft-app">
      <div className="tab-bar">
        <div className="tab-bar-inner">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`tab-btn${tab.id === activeTab ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="chapter-divider">
        <h2 className="chapter-title">{active.title}</h2>
        <hr className="lab-separator" />
      </div>

      <div className="screen">
        <Component />
      </div>
    </div>
  );
}
