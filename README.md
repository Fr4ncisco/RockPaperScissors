# Cachipún Online ✊✋✌️

Piedra, papel o tijera multijugador en tiempo real. Crea una sala, comparte el código (o el enlace) con tus amigos, y jueguen entre **2 y 6 jugadores** desde el navegador.

## Cómo se juega

1. Un jugador crea una sala y recibe un código de 4 caracteres.
2. El resto se une con ese código (o abriendo el enlace compartido).
3. Cuando hay entre 2 y 6 jugadores, cada uno marca "Estoy listo"; la partida arranca sola en cuanto todos lo están.
4. En cada ronda todos eligen piedra (✊), papel (✋) o tijera (✌️) en secreto.
5. Cuando todos jugaron, se revela el resultado:
   - Si todos eligieron lo mismo, o las tres opciones aparecen a la vez, es **empate** y se repite la ronda.
   - Si aparecen exactamente dos jugadas distintas, quienes eligieron la jugada perdedora quedan **eliminados**.
6. Se repite hasta que quede un solo jugador: ¡ese es el ganador!

## Correr localmente

```bash
npm install
npm start
```

Abre `http://localhost:3000` en varias pestañas/dispositivos para probarlo.

## Desplegar directo desde Git

Este proyecto es una app Node.js estándar (Express + Socket.io), así que se puede desplegar directo apuntando cualquiera de estas plataformas a tu repositorio Git — no requiere configuración extra:

- **Render**: "New +" → "Web Service" → conecta el repo. Ya incluye `render.yaml`, así que Render detecta automáticamente el build (`npm install`) y el start (`npm start`).
- **Railway**: "New Project" → "Deploy from GitHub repo". Detecta Node automáticamente.
- **Fly.io / Heroku / cualquier PaaS Node**: mismo flujo — conectar el repo y desplegar; usan `npm start` por convención (`package.json`).

> Importante: como el juego usa WebSockets en tiempo real (Socket.io) con estado en memoria del servidor, necesita un hosting que corra un proceso Node persistente (Render, Railway, Fly.io, un VPS, etc.). No funciona en hosting puramente estático (como GitHub Pages) porque no hay backend.

## Estructura

```
server.js        # servidor Express + Socket.io con la lógica del juego y las salas
public/          # frontend estático (HTML/CSS/JS vanilla)
render.yaml      # config de despliegue para Render
```
