// 사진을 올리기 전에 크기를 줄입니다. (긴 변 기준 maxEdge px, 화질은 눈에 거의 차이가 없는 수준)
// - WebP가 되면 WebP, 안 되면 JPEG로 저장
// - 줄인 결과가 원본보다 커지면 원본을 그대로 씁니다.
export async function compressImage(file: File, maxEdge = 1280, quality = 0.8): Promise<File> {
  if (!file.type.startsWith('image/') || file.size < 150 * 1024) return file
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('이미지를 읽지 못했어요.'))
      el.src = url
    })
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(img, 0, 0, w, h)
    const toBlob = (type: string, q: number) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, q))
    let blob = await toBlob('image/webp', quality)
    if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', 0.82)
    if (!blob || blob.size >= file.size) return file
    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.${ext}`, { type: blob.type })
  } finally {
    URL.revokeObjectURL(url)
  }
}
