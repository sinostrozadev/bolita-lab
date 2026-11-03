import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(92);
Config.setOverwriteOutput(true);
// La máquina tiene poca RAM libre (~2 GB): renders moderados.
Config.setConcurrency(3);
Config.setChromiumOpenGlRenderer('angle');
