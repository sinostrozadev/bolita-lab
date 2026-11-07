<!-- Origen: movido el 2026-11-05 desde ~/.claude/skills/canal-youtube-automatico/SKILL.md §7 (recorte de la skill). -->

# Bitácora del arranque de Bolita Lab

Orden real en que se resolvió, con lo que costó. Sirve para estimar el próximo canal (≈ 3–4 días de Claude).
1. **Día 1–2:** repo, 3 plantillas, guiones por `claude -p`, bandeja, diario en cron. Primer render OK.
2. **Canal:** creado por el piloto como cuenta de marca; descripción/keywords; teléfono verificado.
3. **Primera tanda (10 videos):** subida por Studio, 2/día programados. Tope diario de Studio (~10) descubierto a
   la mala: reintento a las 24 h con un script que espera RAM y verifica borradores.
4. **Primera revisión** (fotogramas): gancho invisible en frame 0, carreras sin identidad, datos sin imágenes →
   3 agentes Opus en paralelo, 10 videos re-renderizados. Herramientas nuevas: Commons API, simple-icons, Noto Emoji.
5. **API:** proyecto Cloud, OAuth, Analytics; sitio público (Pages) con privacidad/términos; formulario de auditoría
   rellenado por el piloto con 7 evidencias (capturas, PDFs, 2 diagramas obligatorios); consentimientos y Enviar =
   Santiago. Branding + Data Access (scopes) por el piloto; Publish app = Santiago. Token sigue a 7 días hasta
   verificar la app: `estado.mts` avisa; renovar = 3 clics.
6. **Red de seguridad:** el diario no sube por API sin `secrets/api-auditada`; `PARA-SUBIR-A-MANO.md` siempre al día.
7. **Nube:** workflows probados y apagados hasta la auditoría; secretos de GitHub los carga Santiago.
8. **Mejora continua:** revisión semanal en cron; referentes (Ñerd, GeoGlobeTales, 8 del nicho) → fórmula de guion
   en el prompt de `dato` (probada con 4 guiones). Skills escritas para repetir todo esto.
9. **Lo que sigue pendiente para "100 % automático":** aprobación de la auditoría (días/semanas) → nube encendida
   y cron local apagado; token permanente (verificación OAuth); RAM (`.wslconfig 12GB`, desactivar Codeium);
   `scripts/cumplimiento.mts` (monetización automática); plantilla `historia` 2–3 min.
