/**
 * Comprime y redimensiona una imagen en el navegador del cliente antes de subirla.
 * Esto garantiza subidas instantáneas, mínimo consumo de datos móviles y persistencia
 * limpia y ligera dentro de SQLite / copias de seguridad JSON.
 */
export function compressImageFile(file: File, maxDimension = 900, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('El archivo seleccionado no es una imagen.'))
      return
    }

    const reader = new FileReader()
    reader.onerror = () => reject(new Error('No se pudo leer la foto seleccionada.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('El formato de la foto no es compatible.'))
      img.onload = () => {
        let width = img.width
        let height = img.height

        if (width > maxDimension || height > maxDimension) {
          const ratio = Math.min(maxDimension / width, maxDimension / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(String(reader.result))
          return
        }

        // Fondo blanco para evitar fondos negros en PNG transparentes al exportar a JPEG
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)

        const compressed = canvas.toDataURL('image/jpeg', quality)
        resolve(compressed)
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}
