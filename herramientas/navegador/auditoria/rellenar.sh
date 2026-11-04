#!/bin/bash
# Rellena el formulario de auditoría de la API de YouTube en el navegador piloto (puerto 8777) con las
# respuestas de docs/AUDITORIA-API.md y adjunta la evidencia de salida/auditoria/. Si la pestaña se cae,
# correr esto de nuevo deja el formulario listo. Lo que NO hace (consentimientos, los da Santiago):
# "Aceptación obligatoria" (sección 4), "He leído y acepto…" de métricas (sección 5), sección 7 y Enviar.
set -e; cd "$(dirname "$0")/../../.."; B=http://127.0.0.1:8777; A=/home/santiago/idea/salida/auditoria
python3 -c "import urllib.parse;print(urllib.parse.quote('https://support.google.com/youtube/contact/yt_api_form'))" | xargs -I{} curl -s -m 60 "$B/ir?url={}" >/dev/null; sleep 8
# abrir las 6 secciones (son toggles de la interfaz, no consentimientos)
curl -s -m 30 --get "$B/eval" --data-urlencode "js=(()=>{for(const e of document.querySelectorAll('input[type=checkbox]')){if(/^Secci.n [2-6]/.test(e.getAttribute('aria-label')||'')&&!e.checked)e.click();}return 1})()" >/dev/null; sleep 2
curl -s -m 30 --get "$B/eval" --data-urlencode "js=$(cat herramientas/navegador/auditoria/llenar.js)"; echo
curl -s -m 30 --get "$B/eval" --data-urlencode "js=(()=>{const T=(n,v)=>{const e=document.querySelector('[name='+n+']');e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))};T('organization_name','Yo');T('parent_company_name','Yo');const s=document.getElementById('search_list_checkbox_1--search_list');if(s.checked)s.click();return 1})()" >/dev/null
for par in "upload_1_1 privacidad.png" "upload_1_2 inicio-con-enlace.png" "upload_1_3 terminos.pdf" "upload_1_4 oauth-y-subida.pdf" "sending_documents_yt_api subir.mts.pdf" "architecture_diagram diagrama-arquitectura.png" "user_flow_diagram diagrama-flujo-usuario.png"; do set -- $par; curl -s -m 30 --get "$B/archivo" --data-urlencode "sel=input[name=$1]" --data-urlencode "ruta=$A/$2" >/dev/null; done
curl -s -m 30 --get "$B/eval" --data-urlencode "js=(()=>{document.getElementById('acknowledgement--acknowledged').scrollIntoView({block:'center'});return 'formulario listo'})()"; echo
