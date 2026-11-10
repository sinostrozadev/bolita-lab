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
import { registrar as maquina } from './plantillas/maquina';

export const Root: React.FC = () => (
  <>
    <Folder name="Bola">{bola()}</Folder>
    <Folder name="Dato">{dato()}</Folder>
    <Folder name="Carrera">{carrera()}</Folder>
    <Folder name="Marca">{marca()}</Folder>
    <Folder name="Maquina">{maquina()}</Folder>
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
