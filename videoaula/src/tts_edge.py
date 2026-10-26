"""videoaula/src/tts_edge.py
Sintetiza um texto com o Edge TTS e grava o MP3 e os limites de cada palavra
(tempo de início e duração, em segundos), usados para sincronizar as ações.
Uso: python -I tts_edge.py <arquivo-texto> <voz> <velocidade> <saida.mp3> <saida.json>
"""
import asyncio
import json
import sys

import edge_tts


async def sintetizar(texto, voz, velocidade, mp3, saida_json):
    comunicar = edge_tts.Communicate(texto, voz, rate=velocidade, boundary="WordBoundary")
    palavras = []
    with open(mp3, "wb") as f:
        async for parte in comunicar.stream():
            if parte["type"] == "audio":
                f.write(parte["data"])
            elif parte["type"] == "WordBoundary":
                palavras.append({
                    "t": parte["offset"] / 1e7,
                    "d": parte["duration"] / 1e7,
                    "texto": parte["text"],
                })
    with open(saida_json, "w", encoding="utf-8") as f:
        json.dump(palavras, f, ensure_ascii=False)


if __name__ == "__main__":
    arq_texto, voz, velocidade, mp3, saida_json = sys.argv[1:6]
    with open(arq_texto, encoding="utf-8") as f:
        texto = f.read()
    asyncio.run(sintetizar(texto, voz, velocidade, mp3, saida_json))
