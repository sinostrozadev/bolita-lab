import React from 'react';
import { Composition, Folder } from 'remotion';
import { FORMATO } from './marca/tokens';
// Cada plantilla vive en src/plantillas/<nombre>/ y exporta `registrar()`,
// que devuelve los <Composition> de esa plantilla. Así cada agente registra
// lo suyo sin tocar las demás.
import { registrar as bola } from './plantillas/bola';
import { registrar as dato } from './plantillas/dato';
import { registrar as carrera } from './plantillas/carrera';
import { registrar as marca } from './plantillas/marca';
import { registrar as colores } from './plantillas/colores';
import { registrar as ritmo } from './plantillas/ritmo';
import { registrar as maquina } from './plantillas/maquina';
import { registrar as torneo } from './plantillas/torneo';
import { registrar as relajante } from './plantillas/relajante';
import { registrar as quiz } from './plantillas/quiz';

export const Root: React.FC = () => (
  <>
    <Folder name="Bola">{bola()}</Folder>
    <Folder name="Dato">{dato()}</Folder>
    <Folder name="Carrera">{carrera()}</Folder>
    <Folder name="Colores">{colores()}</Folder>
    <Folder name="Ritmo">{ritmo()}</Folder>
    <Folder name="Marca">{marca()}</Folder>
    <Folder name="Maquina">{maquina()}</Folder>
    <Folder name="Largos">{torneo()}{relajante()}{quiz()}</Folder>
    <Folder name="Pruebas">
      <Composition
        id="Vacio"
        component={() => null}
        width={FORMATO.ancho}
        height={FORMATO.alto}
        fps={FORMATO.fps}
        durationInFrames={60}
      />
    </Folder>
  </>
);
