import { useState, useRef } from 'react'
import { useStore } from '../store'
import { api } from '../api'
import { compressImageFile } from '../lib/image'
import { money, relativeTime } from '../lib/format'
import { Button, Field, Icon, IconButton, Input, Magnet, Modal, TextArea } from './ui'
import type { Member, Task, TaskOption } from '../types'

interface TaskOptionsModalProps {
  task: Task
  members: Member[]
  me: Member | null
  onClose: () => void
  initialAdding?: boolean
}

export function TaskOptionsModal({
  task,
  members,
  me,
  onClose,
  initialAdding = false,
}: TaskOptionsModalProps) {
  const { mutate } = useStore()
  const [adding, setAdding] = useState(initialAdding)
  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('')
  const [detail, setDetail] = useState('')
  const [photoDataUrl, setPhotoDataUrl] = useState('')
  const [compressing, setCompressing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null)
  const [actionInProgress, setActionInProgress] = useState<number | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const options: TaskOption[] = task.options || []

  // Calcular la cantidad máxima de votos para destacar la opción más votada
  const maxVotes = options.reduce((max, opt) => Math.max(max, opt.vote_count || 0), 0)

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setCompressing(true)
      const compressed = await compressImageFile(file, 900, 0.75)
      setPhotoDataUrl(compressed)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al procesar la foto'
      alert(msg)
    } finally {
      setCompressing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSaveOption = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanTitle = title.trim()
    if (!cleanTitle) return

    setSubmitting(true)
    const ok = await mutate(
      () =>
        api.createTaskOption(task.id, {
          title: cleanTitle,
          price: price ? parseFloat(price) : 0,
          detail: detail.trim(),
          image_url: photoDataUrl,
        }),
      'Opción agregada para votación',
    )
    setSubmitting(false)

    if (ok) {
      setTitle('')
      setPrice('')
      setDetail('')
      setPhotoDataUrl('')
      setAdding(false)
    }
  }

  const handleToggleVote = async (option: TaskOption) => {
    if (!me) {
      alert('Por favor selecciona tu imán (quién eres) arriba para poder votar.')
      return
    }
    setActionInProgress(option.id)
    await mutate(() => api.voteTaskOption(option.id), 'Voto registrado')
    setActionInProgress(null)
  }

  const handleToggleWinner = async (option: TaskOption) => {
    setActionInProgress(option.id)
    const willBeWinner = option.is_winner !== 1
    await mutate(
      () => api.setOptionWinner(option.id, willBeWinner),
      willBeWinner ? `“${option.title}” elegida como opción oficial` : 'Opción desmarcada',
    )
    setActionInProgress(null)
  }

  const handleDeleteOption = async (option: TaskOption) => {
    if (!window.confirm(`¿Eliminar la opción “${option.title}”?`)) return
    setActionInProgress(option.id)
    await mutate(() => api.deleteTaskOption(option.id), 'Opción eliminada')
    setActionInProgress(null)
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        wide
        title={`Fotos y Opciones: ${task.title}`}
        description="Sube fotos de las opciones que encuentres para que el equipo pueda comparar y elegir."
        footer={
          <>
            {!adding ? (
              <Button icon="camera" onClick={() => setAdding(true)}>
                Subir foto
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setAdding(false)}>
                Ver fotos ({options.length})
              </Button>
            )}
            <span className="spacer" />
            <Button variant="outline" onClick={onClose}>
              Cerrar
            </Button>
          </>
        }
      >
        <div className="task-options-view">
          {/* Formulario para agregar nueva opción con foto */}
          {adding ? (
            <form onSubmit={handleSaveOption} className="option-new-form">
              <div className="form-legend">
                <span className="badge-pill">Nueva opción</span>
                <h4>Sube una foto de la opción encontrada</h4>
                <p className="small muted">
                  Toma una foto con tu celular o elige de tu galería para que el equipo pueda verla y votar.
                </p>
              </div>

              <div className="option-form-layout">
                {/* Selector de foto con cámara o archivo */}
                <div className="option-photo-picker">
                  {photoDataUrl ? (
                    <div className="photo-preview-box">
                      <img src={photoDataUrl} alt="Vista previa de foto" className="preview-img" />
                      <div className="preview-overlay">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={compressing}
                        >
                          Cambiar foto
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          onClick={() => setPhotoDataUrl('')}
                        >
                          Quitar foto
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="photo-dropzone"
                      onClick={() => !compressing && fileInputRef.current?.click()}
                    >
                      <Icon name="camera" size={32} />
                      <strong>{compressing ? 'Procesando foto…' : 'Tomar foto o subir imagen'}</strong>
                      <span className="small muted">
                        {compressing ? 'Espera un segundo…' : 'Toca aquí para abrir tu cámara o galería'}
                      </span>
                    </div>
                  )}

                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={handlePhotoSelect}
                  />
                </div>

                {/* Campos de texto */}
                <div className="option-form-fields">
                  <Field label="Nombre o descripción de la opción" hint="Ej: Opción 1, Kiko Chicharrones, San Antonio...">
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Ej. Opción 1: Kiko Chicharrones"
                      autoFocus
                      required
                    />
                  </Field>

                  <div className="form-row">
                    <Field label="Precio en Soles (opcional)" hint="Costo unitario o total">
                      <Input
                        type="number"
                        step="0.10"
                        min="0"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        placeholder="Ej. 160.00"
                      />
                    </Field>
                  </div>

                  <Field label="Nota adicional (opcional)" hint="Qué incluye, porciones o detalles...">
                    <TextArea
                      rows={3}
                      value={detail}
                      onChange={(e) => setDetail(e.target.value)}
                      placeholder="Detalles sobre lo que viste o averiguaste..."
                    />
                  </Field>

                  <div className="form-actions-inline">
                    <Button
                      type="submit"
                      disabled={!title.trim() || submitting || compressing}
                      variant="primary"
                    >
                      {submitting ? 'Guardando…' : 'Guardar foto'}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              </div>
            </form>
          ) : null}

          {/* Lista comparativa de opciones */}
          {!adding && options.length === 0 ? (
            <div className="options-empty-state">
              <div className="empty-polaroid">
                <Icon name="camera" size={44} />
              </div>
              <h3>Aún no hay fotos subidas</h3>
              <p className="muted">
                Si encuentras opciones, tómales foto y súbelas aquí para que todos puedan comparar y elegir.
              </p>
              <Button icon="camera" onClick={() => setAdding(true)}>
                Subir primera foto
              </Button>
            </div>
          ) : null}

          {options.length > 0 && !adding ? (
            <div className="options-list-container">
              <div className="options-status-summary">
                <span>
                  <strong>{options.length}</strong> {options.length === 1 ? 'opción subida' : 'opciones comparadas'}
                </span>
                <span className="dot-sep">·</span>
                <span className="small muted">
                  {me ? (
                    <>Tu imán: <strong style={{ color: me.color }}>{me.name}</strong></>
                  ) : (
                    'Elige tu imán arriba para firmar tu voto'
                  )}
                </span>
              </div>

              <div className="options-grid">
                {options.map((option) => {
                  const hasMyVote = me ? option.votes.includes(me.id) : false
                  const isTopVoted = maxVotes > 0 && option.vote_count === maxVotes && !option.is_winner
                  const voters = members.filter((m) => option.votes.includes(m.id))
                  const creator = option.created_by ? members.find((m) => m.id === option.created_by) : null

                  return (
                    <div
                      key={option.id}
                      className={`option-card ${option.is_winner ? 'is-winner' : ''} ${hasMyVote ? 'has-my-vote' : ''}`}
                    >
                      {/* Cabecera / Badges */}
                      <div className="option-card-header">
                        {option.is_winner ? (
                          <span className="winner-badge">
                            <Icon name="trophy" size={14} /> Opción Elegida
                          </span>
                        ) : isTopVoted ? (
                          <span className="top-voted-badge">
                            🔥 Más votada ({option.vote_count})
                          </span>
                        ) : (
                          <span className="vote-count-pill">
                            🗳️ {option.vote_count} {option.vote_count === 1 ? 'voto' : 'votos'}
                          </span>
                        )}

                        <div className="option-card-tools">
                          <IconButton
                            icon="trash"
                            label="Eliminar opción"
                            onClick={() => void handleDeleteOption(option)}
                            disabled={actionInProgress === option.id}
                          />
                        </div>
                      </div>

                      {/* Foto */}
                      {option.image_url ? (
                        <div
                          className="option-photo-wrapper"
                          onClick={() => setPreviewPhoto(option.image_url)}
                          title="Haz clic para ver la foto en grande"
                        >
                          <img src={option.image_url} alt={option.title} className="option-photo-img" />
                          <div className="photo-zoom-hint">
                            <Icon name="search" size={16} /> Ver en grande
                          </div>
                        </div>
                      ) : (
                        <div className="option-no-photo">
                          <Icon name="image" size={28} />
                          <span className="small muted">Sin foto adjunta</span>
                        </div>
                      )}

                      {/* Contenido */}
                      <div className="option-body">
                        <div className="option-title-row">
                          <h4 className="option-title">{option.title}</h4>
                          {option.price > 0 ? (
                            <span className="option-price-tag">{money(option.price)}</span>
                          ) : null}
                        </div>

                        {option.detail ? (
                          <p className="option-detail">{option.detail}</p>
                        ) : null}

                        {/* Colaborador que la subió */}
                        <div className="option-author small muted">
                          <span>Subido por:</span>
                          {creator ? (
                            <Magnet member={creator} me={creator.id === me?.id} />
                          ) : (
                            <span>{option.created_by_name || 'Equipo'}</span>
                          )}
                          {option.created_at ? (
                            <span className="option-time">({relativeTime(option.created_at)})</span>
                          ) : null}
                        </div>

                        {/* Votantes */}
                        <div className="option-voters-section">
                          <span className="small muted voters-label">
                            {voters.length > 0 ? 'Votos de:' : 'Sin votos aún'}
                          </span>
                          <div className="voters-magnets">
                            {voters.map((voter) => (
                              <Magnet key={voter.id} member={voter} me={voter.id === me?.id} />
                            ))}
                          </div>
                        </div>

                        {/* Botones de acción */}
                        <div className="option-actions">
                          <button
                            type="button"
                            className={`btn-vote ${hasMyVote ? 'is-voted' : ''}`}
                            onClick={() => void handleToggleVote(option)}
                            disabled={actionInProgress === option.id}
                          >
                            <Icon name="thumbsUp" size={16} />
                            {hasMyVote ? 'Tu voto (retirar)' : 'Votar por esta'}
                          </button>

                          <button
                            type="button"
                            className={`btn-select-winner ${option.is_winner ? 'is-active' : ''}`}
                            onClick={() => void handleToggleWinner(option)}
                            disabled={actionInProgress === option.id}
                            title={option.is_winner ? 'Desmarcar como elegida' : 'Marcar esta opción como la elegida oficialmente'}
                          >
                            <Icon name="trophy" size={14} />
                            {option.is_winner ? 'Elegida' : 'Elegir'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
      </Modal>

      {/* Lightbox para ver la foto en pantalla completa */}
      {previewPhoto ? (
        <div className="photo-lightbox" onClick={() => setPreviewPhoto(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={previewPhoto} alt="Cotización ampliada" className="lightbox-img" />
            <button
              type="button"
              className="lightbox-close"
              onClick={() => setPreviewPhoto(null)}
              aria-label="Cerrar imagen"
            >
              <Icon name="x" size={24} />
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
