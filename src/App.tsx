import './App.css'
import { Tldraw, useEditor, defaultHandleExternalFileContent } from 'tldraw'
import 'tldraw/tldraw.css'
import { useRef, useState, useEffect, useCallback } from 'react'

type UploadOverlayState = {
  // page-space center where frame was created
  pageCenter: { x: number; y: number }
  // screen-space center at time of creation (for overlay positioning)
  screenCenter: { x: number; y: number }
  // frame ID and dimensions
  frameId: string
  frameWidth: number
  frameHeight: number
}

type NodeOverlayState = {
  nodeId: string
  nodeX: number
  nodeY: number
  screenX: number
  screenY: number
}

type ConnectionState = {
  fromNodeId: string
  fromScreenX: number
  fromScreenY: number
  currentX: number
  currentY: number
}

type ConnectionInfo = {
  fromNodeId: string
  toNodeId: string
}

type NodeCreationModalState = {
  show: boolean
  position: { x: number; y: number }
  fromNodeId: string | null
}

function MyToolbar() {
  const editor = useEditor()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const nodeFileInputRef = useRef<HTMLInputElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [overlay, setOverlay] = useState<UploadOverlayState | null>(null)
  const [nodeOverlay, setNodeOverlay] = useState<NodeOverlayState | null>(null)
  const [connectionState, setConnectionState] = useState<ConnectionState | null>(null)
  const [nodeOverlays, setNodeOverlays] = useState<Map<string, NodeOverlayState>>(new Map())
  const [activeUploadNodes, setActiveUploadNodes] = useState<Set<string>>(new Set())
  const [connections, setConnections] = useState<Map<string, ConnectionInfo>>(new Map())
  const [nodeCreationModal, setNodeCreationModal] = useState<NodeCreationModalState>({
    show: false,
    position: { x: 0, y: 0 },
    fromNodeId: null,
  })
  const [nanobananaNodes, setNanobananaNodes] = useState<Map<string, { text: string; outputImageUrl: string | null; isLoading: boolean; previewImageUrl: string | null }>>(new Map())
  type Material = {
    id: string
    url: string
    position: { x: number; y: number }
    size: { width: number; height: number }
  }
  const [imageNodes, setImageNodes] = useState<Map<string, { 
    imageUrl: string | null
    materials: Material[]
  }>>(new Map())
  const [draggingMaterial, setDraggingMaterial] = useState<{ nodeId: string; materialId: string; startX: number; startY: number; offsetX: number; offsetY: number } | null>(null)
  const [resizingMaterial, setResizingMaterial] = useState<{ nodeId: string; materialId: string; startX: number; startY: number; startWidth: number; startHeight: number } | null>(null)
  const [selectedMaterial, setSelectedMaterial] = useState<{ nodeId: string; materialId: string } | null>(null)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [materialModalOpen, setMaterialModalOpen] = useState(false)
  const [currentMaterialNodeId, setCurrentMaterialNodeId] = useState<string | null>(null)
  const [sketchModalOpen, setSketchModalOpen] = useState(false)
  const [currentSketchNodeId, setCurrentSketchNodeId] = useState<string | null>(null)
  const [selectedSketchCategory, setSelectedSketchCategory] = useState<'men' | 'women'>('men')
  const [selectedMenCategory, setSelectedMenCategory] = useState<string>('boatShoes')
  const [selectedWomenCategory, setSelectedWomenCategory] = useState<string>('boots')
  const projectFileInputRef = useRef<HTMLInputElement | null>(null)

  // 다크모드 감지
  useEffect(() => {
    const updateTheme = () => {
      try {
        // tldraw의 테마 감지
        const userPreferences = editor.user.getUserPreferences()
        const darkMode = userPreferences?.isDarkMode ?? false
        setIsDarkMode(darkMode)
      } catch (e) {
        // 폴백: 시스템 테마 감지
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        setIsDarkMode(prefersDark)
      }
    }

    updateTheme()
    const unsubscribe = editor.store.listen(() => {
      updateTheme()
    })

    // 시스템 테마 변경 감지
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleThemeChange = () => {
      try {
        const userPreferences = editor.user.getUserPreferences()
        const darkMode = userPreferences?.isDarkMode ?? mediaQuery.matches
        setIsDarkMode(darkMode)
      } catch (e) {
        setIsDarkMode(mediaQuery.matches)
      }
    }
    mediaQuery.addEventListener('change', handleThemeChange)

    return () => {
      unsubscribe()
      mediaQuery.removeEventListener('change', handleThemeChange)
    }
  }, [editor])

  // 테마에 따른 색상 팔레트
  const themeColors = {
    background: isDarkMode ? '#1e1e1e' : '#ffffff',
    surface: isDarkMode ? '#2d2d2d' : '#ffffff',
    border: isDarkMode ? '#404040' : '#cccccc',
    borderDashed: isDarkMode ? '#404040' : '#cccccc',
    text: isDarkMode ? '#e0e0e0' : '#000000',
    textSecondary: isDarkMode ? '#a0a0a0' : '#666666',
    placeholder: isDarkMode ? '#f5f5f5' : '#f5f5f5',
    buttonBg: isDarkMode ? '#2d2d2d' : '#ffffff',
    buttonHover: isDarkMode ? '#3d3d3d' : '#f0f0f0',
  }

  // Zoom 레벨 추적
  useEffect(() => {
    const updateZoom = () => {
      try {
        const camera = editor.getCamera()
        const zoom = camera.z || 1
        setZoomLevel(zoom)
      } catch (e) {
        setZoomLevel(1)
      }
    }

    updateZoom()
    const unsubscribe = editor.store.listen(() => {
      updateZoom()
    })

    return () => {
      unsubscribe()
    }
  }, [editor])

  // 연결 정보 확인 함수들
  const getConnections = useCallback(() => {
    const result: Array<{ connectionId: string; from: string; to: string }> = []
    connections.forEach((conn, connectionId) => {
      const fromNode = editor.getShape(conn.fromNodeId as any)
      const toNode = editor.getShape(conn.toNodeId as any)
      const fromName = (fromNode as any)?.props?.name || conn.fromNodeId
      const toName = (toNode as any)?.props?.name || conn.toNodeId
      result.push({
        connectionId,
        from: fromName,
        to: toName,
      })
    })
    return result
  }, [connections, editor])

  const getNodeConnections = useCallback((nodeId: string) => {
    const result: Array<{ type: 'outgoing' | 'incoming'; targetNodeId: string }> = []
    connections.forEach((conn) => {
      if (conn.fromNodeId === nodeId) {
        result.push({ type: 'outgoing', targetNodeId: conn.toNodeId })
      } else if (conn.toNodeId === nodeId) {
        result.push({ type: 'incoming', targetNodeId: conn.fromNodeId })
      }
    })
    return result
  }, [connections])

  // 연결 정보를 전역으로 노출 (디버깅용)
  useEffect(() => {
    ;(window as any).getConnections = getConnections
    ;(window as any).getNodeConnections = getNodeConnections
    return () => {
      delete (window as any).getConnections
      delete (window as any).getNodeConnections
    }
  }, [getConnections, getNodeConnections])


  // nodebasedtest의 drawConnection 함수를 가져옴 (화살표 제거)
  const drawConnection = useCallback((ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) => {
    ctx.strokeStyle = '#007acc'
    ctx.lineWidth = 2
    ctx.beginPath()
    
    // 베지어 커브로 그리기 (nodebasedtest 패턴)
    const cp1x = x1 + Math.abs(x2 - x1) * 0.5
    const cp1y = y1
    const cp2x = x2 - Math.abs(x2 - x1) * 0.5
    const cp2y = y2
    
    ctx.moveTo(x1, y1)
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2)
    ctx.stroke()
  }, [])

  // 모든 연결선을 Canvas에 그리기 (nodebasedtest의 drawConnections 패턴)
  const drawAllConnections = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Canvas 크기 설정
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    // 이전 그리기 지우기
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // 모든 연결선 그리기
    connections.forEach((conn) => {
      const fromNode = editor.getShape(conn.fromNodeId as any)
      const toNode = editor.getShape(conn.toNodeId as any)

      if (fromNode && toNode) {
        const fromNodeX = fromNode.x
        const fromNodeY = fromNode.y
        const fromNodeW = (fromNode as any).props?.w || 300

        const toNodeX = toNode.x
        const toNodeY = toNode.y

        // Start point: right edge of from node (top)
        const startX = fromNodeX + fromNodeW
        const startY = fromNodeY + 20

        // End point: left edge of to node (top)
        const endX = toNodeX
        const endY = toNodeY + 20

        // 페이지 좌표를 화면 좌표로 변환
        const startScreen = editor.pageToScreen({ x: startX, y: startY })
        const endScreen = editor.pageToScreen({ x: endX, y: endY })

        // 연결선 그리기
        drawConnection(ctx, startScreen.x, startScreen.y, endScreen.x, endScreen.y)
      }
    })
  }, [connections, editor, drawConnection])

  // Canvas 크기 조정 및 연결선 다시 그리기
  useEffect(() => {
    const resizeCanvas = () => {
      const canvas = canvasRef.current
      if (canvas) {
        canvas.width = window.innerWidth
        canvas.height = window.innerHeight
        drawAllConnections()
      }
    }

    window.addEventListener('resize', resizeCanvas)
    resizeCanvas()

    return () => {
      window.removeEventListener('resize', resizeCanvas)
    }
  }, [drawAllConnections])

  // 연결선 업데이트 (노드 위치 변경 시, viewport 변경 시)
  useEffect(() => {
    const updateOnViewportChange = () => {
      drawAllConnections()
    }

    // editor의 viewport 변경 감지
    const unsubscribe = editor.store.listen(() => {
      updateOnViewportChange()
    })

    // 주기적으로 연결선 업데이트 (노드 이동 중)
    const interval = setInterval(() => {
      drawAllConnections()
    }, 50)

    return () => {
      unsubscribe()
      clearInterval(interval)
    }
  }, [drawAllConnections, editor])

  // 부자재 이미지 드래그 핸들러
  useEffect(() => {
    if (!draggingMaterial) return

    const handleMouseMove = (e: MouseEvent) => {
      const imageNodeState = imageNodes.get(draggingMaterial.nodeId)
      if (!imageNodeState) return

      const nodeShape = editor.getShape(draggingMaterial.nodeId as any)
      if (!nodeShape) return

      const nodeWidth = (nodeShape as any).props?.w || 350
      const nodeHeight = (nodeShape as any).props?.h || 400
      const nodeScreenPos = editor.pageToScreen({ x: nodeShape.x, y: nodeShape.y })
      
      // 이미지 표시 영역의 실제 화면 크기 계산 (패딩 제외)
      const imageAreaWidth = nodeWidth * zoomLevel - 24 // 패딩 12px * 2
      const imageAreaHeight = (nodeHeight - 62) * zoomLevel - 24 // 패딩 12px * 2

      // 마우스 위치를 컨테이너 기준 퍼센트로 변환
      const containerX = nodeScreenPos.x + 12 * zoomLevel
      const containerY = nodeScreenPos.y + 12 * zoomLevel
      
      const material = imageNodeState.materials.find(m => m.id === draggingMaterial.materialId)
      if (!material) return
      
      const newX = ((e.clientX - containerX) / imageAreaWidth) * 100 - draggingMaterial.offsetX
      const newY = ((e.clientY - containerY) / imageAreaHeight) * 100 - draggingMaterial.offsetY

      // 경계 체크
      const maxX = 100 - material.size.width
      const maxY = 100 - material.size.height
      
      const clampedX = Math.max(0, Math.min(maxX, newX))
      const clampedY = Math.max(0, Math.min(maxY, newY))

      setImageNodes(prev => {
        const updated = new Map(prev)
        const current = prev.get(draggingMaterial.nodeId)
        if (current) {
          updated.set(draggingMaterial.nodeId, {
            ...current,
            materials: current.materials.map(m => 
              m.id === draggingMaterial.materialId 
                ? { ...m, position: { x: clampedX, y: clampedY } }
                : m
            )
          })
        }
        return updated
      })
    }

    const handleMouseUp = () => {
      setDraggingMaterial(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [draggingMaterial, imageNodes, editor, zoomLevel])

  // 부자재 이미지 리사이즈 핸들러
  useEffect(() => {
    if (!resizingMaterial) return

    const handleMouseMove = (e: MouseEvent) => {
      const imageNodeState = imageNodes.get(resizingMaterial.nodeId)
      if (!imageNodeState) return

      const nodeShape = editor.getShape(resizingMaterial.nodeId as any)
      if (!nodeShape) return

      const nodeWidth = (nodeShape as any).props?.w || 350
      const nodeHeight = (nodeShape as any).props?.h || 400
      const nodeScreenPos = editor.pageToScreen({ x: nodeShape.x, y: nodeShape.y })
      
      // 이미지 표시 영역의 실제 화면 크기 계산
      const imageAreaWidth = nodeWidth * zoomLevel - 24
      const imageAreaHeight = (nodeHeight - 62) * zoomLevel - 24

      const containerX = nodeScreenPos.x + 12 * zoomLevel
      const containerY = nodeScreenPos.y + 12 * zoomLevel

      // 리사이즈 핸들 위치 기준으로 크기 계산
      const material = imageNodeState.materials.find(m => m.id === resizingMaterial.materialId)
      if (!material) return
      
      const deltaX = ((e.clientX - resizingMaterial.startX) / imageAreaWidth) * 100
      const deltaY = ((e.clientY - resizingMaterial.startY) / imageAreaHeight) * 100

      // 비율 유지하여 크기 변경
      const aspectRatio = resizingMaterial.startWidth / resizingMaterial.startHeight
      const newWidth = Math.max(8, Math.min(100 - material.position.x, resizingMaterial.startWidth + deltaX))
      const newHeight = Math.max(8, Math.min(100 - material.position.y, newWidth / aspectRatio))

      setImageNodes(prev => {
        const updated = new Map(prev)
        const current = prev.get(resizingMaterial.nodeId)
        if (current) {
          updated.set(resizingMaterial.nodeId, {
            ...current,
            materials: current.materials.map(m => 
              m.id === resizingMaterial.materialId 
                ? { ...m, size: { width: newWidth, height: newHeight } }
                : m
            )
          })
        }
        return updated
      })
    }

    const handleMouseUp = () => {
      setResizingMaterial(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [resizingMaterial, imageNodes, editor, zoomLevel])

  // 프레임 외부 영역 클릭 시 부자재 선택 해제
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // 이미지 노드 오버레이 영역 내부인지 확인
      const isImageNodeOverlay = target.closest('[data-image-node-overlay]')
      // 부자재 이미지나 리사이즈 핸들을 클릭한 경우는 제외
      const isMaterialImage = target.closest('[data-material-image]')
      const isResizeHandle = target.closest('[data-resize-handle]')
      // 부자재 버튼을 클릭한 경우는 제외
      const isMaterialButton = target.closest('[data-material-button]')
      
      // 이미지 노드 오버레이 외부를 클릭한 경우에만 선택 해제
      // (부자재 이미지, 리사이즈 핸들, 부자재 버튼을 클릭한 경우는 제외)
      if (!isImageNodeOverlay && !isMaterialImage && !isResizeHandle && !isMaterialButton) {
        setSelectedMaterial(null)
      }
    }

    // bubble phase에서 실행하여 onClick 이벤트가 먼저 처리되도록 함
    document.addEventListener('click', handleDocumentClick)
    return () => {
      document.removeEventListener('click', handleDocumentClick)
    }
  }, [])

  // 노드 위치 변경 시 오버레이 위치 업데이트
  useEffect(() => {
    const updateNodeOverlays = () => {
      setNodeOverlays(prev => {
        const updated = new Map(prev)
        let hasChanges = false

        prev.forEach((overlay, nodeId) => {
          const nodeShape = editor.getShape(nodeId as any)
          if (nodeShape) {
            const nodeX = nodeShape.x
            const nodeY = nodeShape.y
            const nodeWidth = (nodeShape as any).props?.w || 300
            const nodeHeight = (nodeShape as any).props?.h || 200

            const nodeScreenPos = editor.pageToScreen({ 
              x: nodeX + nodeWidth / 2, 
              y: nodeY + nodeHeight / 2 
            })

            const newOverlay: NodeOverlayState = {
              nodeId,
              nodeX: nodeX + nodeWidth / 2,
              nodeY: nodeY + nodeHeight / 2,
              screenX: nodeScreenPos.x,
              screenY: nodeScreenPos.y,
            }

            if (overlay.screenX !== newOverlay.screenX || overlay.screenY !== newOverlay.screenY) {
              updated.set(nodeId, newOverlay)
              hasChanges = true

              // 현재 선택된 노드 오버레이도 업데이트
              if (nodeOverlay && nodeOverlay.nodeId === nodeId) {
                setNodeOverlay(newOverlay)
              }

              // 연결선 다시 그리기 (nodebasedtest 패턴)
              setTimeout(() => {
                drawAllConnections()
              }, 10)
            }
          } else {
            // 노드가 삭제된 경우
            updated.delete(nodeId)
            hasChanges = true
            setActiveUploadNodes(prev => {
              const next = new Set(prev)
              next.delete(nodeId)
              return next
            })
            if (nodeOverlay && nodeOverlay.nodeId === nodeId) {
              setNodeOverlay(null)
            }
            // 이 노드와 연결된 연결선들도 삭제 (nodebasedtest 패턴)
            setConnections(prev => {
              const updated = new Map(prev)
              prev.forEach((conn, connectionId) => {
                if (conn.fromNodeId === nodeId || conn.toNodeId === nodeId) {
                  updated.delete(connectionId)
                }
              })
              return updated
            })
            // 나노바나나 노드 상태도 삭제
            setNanobananaNodes(prev => {
              const updated = new Map(prev)
              updated.delete(nodeId)
              return updated
            })
            // 이미지 노드 상태도 삭제
            setImageNodes(prev => {
              const updated = new Map(prev)
              const imageNodeState = prev.get(nodeId)
              // URL 해제 (메모리 누수 방지)
              if (imageNodeState?.imageUrl) {
                URL.revokeObjectURL(imageNodeState.imageUrl)
              }
              updated.delete(nodeId)
              return updated
            })
            // 연결선 다시 그리기
            setTimeout(() => {
              drawAllConnections()
            }, 10)
          }
        })

        return hasChanges ? updated : prev
      })
    }

    // 주기적으로 노드 위치 확인
    const interval = setInterval(updateNodeOverlays, 50)
    
    // editor의 상태 변경 감지
    const unsubscribe = editor.store.listen(() => {
      updateNodeOverlays()
    })

    return () => {
      clearInterval(interval)
      unsubscribe()
    }
  }, [editor, nodeOverlay, drawAllConnections])

  const addCenteredRect = () => {
    const bounds = (editor as any).getViewportPageBounds?.()
    let cx: number
    let cy: number
    if (bounds) {
      cx = bounds.x + bounds.w / 2
      cy = bounds.y + bounds.h / 2
    } else {
      const centerScreen = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      const center = editor.screenToPage(centerScreen)
      cx = center.x
      cy = center.y
    }
    editor.createShape({
      type: 'geo',
      x: cx - 100,
      y: cy - 100,
      props: { geo: 'rectangle', w: 200, h: 200 },
    })
  }

  const addFrameWithUpload = () => {
    // compute center in page-space
    const bounds = (editor as any).getViewportPageBounds?.()
    let cx: number
    let cy: number
    if (bounds) {
      cx = bounds.x + bounds.w / 2
      cy = bounds.y + bounds.h / 2
    } else {
      const centerScreen = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      const center = editor.screenToPage(centerScreen)
      cx = center.x
      cy = center.y
    }

    const frameWidth = 600
    const frameHeight = 400
    const frameX = cx - frameWidth / 2
    const frameY = cy - frameHeight / 2

    // Create frame
    editor.createShape({
      type: 'frame',
      x: frameX,
      y: frameY,
      props: { w: frameWidth, h: frameHeight, name: '이미지 프레임' },
    } as any)

    // Use setTimeout to ensure the shape is created before we try to find it
    setTimeout(() => {
      const shapes = editor.getCurrentPageShapes()
      const frameShape = shapes
        .filter((s) => s.type === 'frame')
        .find((s) => {
          const dx = Math.abs(s.x - frameX)
          const dy = Math.abs(s.y - frameY)
          return dx < 10 && dy < 10
        })
      
      const frameId = frameShape?.id || ''
      
      if (!frameId) {
        console.error('Failed to find created frame')
        return
      }

      // show overlay upload button visually centered on screen
      setOverlay({
        pageCenter: { x: cx, y: cy },
        screenCenter: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
        frameId,
        frameWidth,
        frameHeight,
      })
    }, 50)
  }

  const handleChooseFile = () => {
    if (!fileInputRef.current) return
    fileInputRef.current.value = ''
    fileInputRef.current.click()
  }

  // 이미지 노드의 현재 시각적 상태를 캡처하는 함수
  const captureImageNodeState = useCallback(async (nodeId: string): Promise<string | null> => {
    try {
      // 이미지 노드 오버레이 DOM 요소 찾기
      const imageNodeOverlay = document.querySelector(`[data-image-node-overlay]`) as HTMLElement
      if (!imageNodeOverlay) {
        console.warn('Image node overlay not found')
        return null
      }

      // 이미지 표시 영역 찾기
      const imageArea = imageNodeOverlay.querySelector('[data-image-area]') as HTMLElement
      if (!imageArea) {
        console.warn('Image area not found')
        return null
      }

      // Canvas 생성
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        console.warn('Canvas context not available')
        return null
      }

      // 이미지 영역의 크기 설정
      const rect = imageArea.getBoundingClientRect()
      canvas.width = rect.width
      canvas.height = rect.height

      // 배경색 설정 (테마에 맞게)
      const themeColors = isDarkMode
        ? { background: '#1e1e1e', surface: '#2d2d2d', placeholder: '#3d3d3d', border: '#404040', borderDashed: '#555' }
        : { background: '#ffffff', surface: '#f8f8f8', placeholder: '#f0f0f0', border: '#ddd', borderDashed: '#ccc' }

      ctx.fillStyle = themeColors.surface
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // 이미지 노드 상태 가져오기
      const imageNodeState = imageNodes.get(nodeId)
      if (!imageNodeState) {
        console.warn('Image node state not found')
        return null
      }

      // 기본 이미지 그리기
      if (imageNodeState.imageUrl) {
        const baseImage = new Image()
        await new Promise((resolve, reject) => {
          baseImage.onload = resolve
          baseImage.onerror = reject
          baseImage.crossOrigin = 'anonymous'
          baseImage.src = imageNodeState.imageUrl!
        })

        ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height)
      }

      // 부자재 이미지들 그리기 (오버레이)
      for (const material of imageNodeState.materials) {
        const materialImage = new Image()
        await new Promise((resolve, reject) => {
          materialImage.onload = resolve
          materialImage.onerror = reject
          materialImage.crossOrigin = 'anonymous'
          materialImage.src = material.url
        })

        // 퍼센트 위치를 픽셀 위치로 변환
        const x = (material.position.x / 100) * canvas.width
        const y = (material.position.y / 100) * canvas.height
        const width = (material.size.width / 100) * canvas.width
        const height = (material.size.height / 100) * canvas.height

        ctx.drawImage(materialImage, x, y, width, height)
      }

      // 캡처된 이미지를 Data URL로 반환
      return canvas.toDataURL('image/png')

    } catch (error) {
      console.error('Failed to capture image node state:', error)
      return null
    }
  }, [imageNodes, isDarkMode])

  // PNG 이미지의 여백을 제거하는 함수
  const trimImage = async (imageUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'

      img.onload = () => {
        // Canvas 생성
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas context를 가져올 수 없습니다.'))
          return
        }

        canvas.width = img.width
        canvas.height = img.height

        // 이미지를 Canvas에 그리기
        ctx.drawImage(img, 0, 0)

        // 이미지 데이터 가져오기
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const data = imageData.data

        // 실제 콘텐츠 영역 찾기 (bounding box 계산)
        let minX = canvas.width
        let minY = canvas.height
        let maxX = 0
        let maxY = 0

        // 모든 픽셀을 순회하며 불투명한 픽셀 찾기
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const index = (y * canvas.width + x) * 4
            const alpha = data[index + 3] // Alpha 채널 (0-255)

            // Alpha 값이 10 이상인 픽셀을 콘텐츠로 간주
            if (alpha > 10) {
              if (x < minX) minX = x
              if (x > maxX) maxX = x
              if (y < minY) minY = y
              if (y > maxY) maxY = y
            }
          }
        }

        // 콘텐츠가 없는 경우 원본 반환
        if (minX > maxX || minY > maxY) {
          resolve(imageUrl)
          return
        }

        // 콘텐츠 영역의 크기 계산
        const contentWidth = maxX - minX + 1
        const contentHeight = maxY - minY + 1

        // 새로운 Canvas 생성 (콘텐츠 영역만)
        const trimmedCanvas = document.createElement('canvas')
        const trimmedCtx = trimmedCanvas.getContext('2d')
        if (!trimmedCtx) {
          reject(new Error('Trimmed canvas context를 가져올 수 없습니다.'))
          return
        }

        trimmedCanvas.width = contentWidth
        trimmedCanvas.height = contentHeight

        // 원본 이미지에서 콘텐츠 영역만 잘라내기
        trimmedCtx.drawImage(
          img,
          minX, minY, contentWidth, contentHeight, // 원본에서 잘라낼 영역
          0, 0, contentWidth, contentHeight      // 새 Canvas에 그릴 영역
        )

        // 잘라낸 이미지를 Data URL로 변환
        const trimmedDataUrl = trimmedCanvas.toDataURL('image/png')
        resolve(trimmedDataUrl)
      }

      img.onerror = () => {
        reject(new Error('이미지 로드 실패'))
      }

      img.src = imageUrl
    })
  }

  // 이미지 노드 상태 변경 시 연결된 나노바나나 노드들의 프리뷰 이미지 업데이트
  useEffect(() => {
    const updateNanobananaPreviews = async () => {
      // 모든 나노바나나 노드를 순회
      for (const [nanobananaNodeId, nanobananaState] of nanobananaNodes.entries()) {
        // 연결된 이미지 노드 찾기
        const nodeConnections = getNodeConnections(nanobananaNodeId)
        const incomingConnections = nodeConnections.filter(conn => conn.type === 'incoming')

        if (incomingConnections.length > 0) {
          const connectedNodeId = incomingConnections[0].targetNodeId
          const connectedNode = editor.getShape(connectedNodeId as any)

          // 이미지 노드인지 확인
          if (connectedNode && (connectedNode as any).props?.name === '이미지 노드') {
            // 이미지 노드의 현재 상태 캡처
            const capturedImage = await captureImageNodeState(connectedNodeId)

            // 캡처된 이미지가 기존과 다르면 업데이트
            if (capturedImage !== nanobananaState.previewImageUrl) {
              setNanobananaNodes(prev => {
                const updated = new Map(prev)
                const current = prev.get(nanobananaNodeId)
                if (current) {
                  updated.set(nanobananaNodeId, {
                    ...current,
                    previewImageUrl: capturedImage
                  })
                }
                return updated
              })
            }
          }
        }
      }
    }

    // 이미지 노드 상태가 변경될 때마다 프리뷰 업데이트
    updateNanobananaPreviews()
  }, [imageNodes, nanobananaNodes, editor, captureImageNodeState, getNodeConnections])

  const addImageNode = () => {
    const nodeWidth = 350
    const nodeHeight = 400
    const spacing = 50 // 노드 간 최소 간격

    // 기존 노드들의 위치 확인
    const shapes = editor.getCurrentPageShapes()
    const existingNodes = shapes.filter((s) => s.type === 'frame')
    
    // compute center in page-space
    const bounds = (editor as any).getViewportPageBounds?.()
    let cx: number
    let cy: number
    if (bounds) {
      cx = bounds.x + bounds.w / 2
      cy = bounds.y + bounds.h / 2
    } else {
      const centerScreen = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
      const center = editor.screenToPage(centerScreen)
      cx = center.x
      cy = center.y
    }

    // 겹치지 않는 위치 찾기
    let nodeX = cx - nodeWidth / 2
    let nodeY = cy - nodeHeight / 2
    let attempts = 0
    const maxAttempts = 100
    
    while (attempts < maxAttempts) {
      let overlaps = false
      
      for (const existingNode of existingNodes) {
        const ex = existingNode.x
        const ey = existingNode.y
        const ew = (existingNode as any).props?.w || nodeWidth
        const eh = (existingNode as any).props?.h || nodeHeight
        
        // 겹침 체크: 두 노드가 겹치지 않으려면 한쪽이 완전히 다른 쪽 밖에 있어야 함
        const noOverlap = 
          nodeX + nodeWidth + spacing < ex || // 새 노드가 기존 노드 왼쪽에
          nodeX - spacing > ex + ew ||        // 새 노드가 기존 노드 오른쪽에
          nodeY + nodeHeight + spacing < ey || // 새 노드가 기존 노드 위에
          nodeY - spacing > ey + eh             // 새 노드가 기존 노드 아래에
        
        if (!noOverlap) {
          overlaps = true
          break
        }
      }
      
      if (!overlaps) {
        break
      }
      
      // 겹치면 오른쪽으로 이동
      nodeX += nodeWidth + spacing
      attempts++
    }

    // Create node shape (using frame shape to allow children)
    editor.createShape({
      type: 'frame',
      x: nodeX,
      y: nodeY,
      props: { 
        w: nodeWidth, 
        h: nodeHeight,
        name: '이미지 노드',
      },
    } as any)

    // Find the created node
    setTimeout(() => {
      const allShapes = editor.getCurrentPageShapes()
      const nodeShape = allShapes
        .filter((s) => s.type === 'frame')
        .find((s) => {
          const dx = Math.abs(s.x - nodeX)
          const dy = Math.abs(s.y - nodeY)
          return dx < 10 && dy < 10
        })
      
      const nodeId = nodeShape?.id || ''
      
      if (!nodeId) {
        console.error('Failed to find created node')
        return
      }

      // Convert node position to screen coordinates for overlay
      const nodeScreenPos = editor.pageToScreen({ x: nodeX + nodeWidth / 2, y: nodeY + nodeHeight / 2 })

      const newNodeOverlay: NodeOverlayState = {
        nodeId,
        nodeX: nodeX + nodeWidth / 2,
        nodeY: nodeY + nodeHeight / 2,
        screenX: nodeScreenPos.x,
        screenY: nodeScreenPos.y,
      }

      // Store node overlay in map
      setNodeOverlays(prev => new Map(prev).set(nodeId, newNodeOverlay))

      // Initialize image node state
      setImageNodes(prev => new Map(prev).set(nodeId, { 
        imageUrl: null, 
        materials: []
      }))
    }, 50)
  }

  const handleConnectionStart = (nodeId: string, screenX: number, screenY: number) => {
    const fromNodeId = nodeId
    setConnectionState({
      fromNodeId,
      fromScreenX: screenX,
      fromScreenY: screenY,
      currentX: screenX,
      currentY: screenY,
    })

    const handleMouseMove = (e: MouseEvent) => {
      setConnectionState(prev => prev ? {
        ...prev!,
        currentX: e.clientX,
        currentY: e.clientY,
      } : null)
    }

    const handleMouseUp = (e: MouseEvent) => {
      // Find target node at mouse position
      const targetPoint = editor.screenToPage({ x: e.clientX, y: e.clientY })
      const shapes = editor.getCurrentPageShapes()
      const targetNode = shapes
        .filter((s) => s.type === 'frame' && s.id !== fromNodeId)
        .find((s) => {
          const nodeX = s.x
          const nodeY = s.y
          const nodeWidth = (s as any).props?.w || 300
          const nodeHeight = (s as any).props?.h || 200
          return targetPoint.x >= nodeX && targetPoint.x <= nodeX + nodeWidth &&
                 targetPoint.y >= nodeY && targetPoint.y <= nodeY + nodeHeight
        })

      if (targetNode) {
        // 연결 정보만 저장 (nodebasedtest 패턴 - arrow shape 대신 연결 정보만 저장)
        const connectionId = `conn:${fromNodeId}:${targetNode.id}`
        
        // 연결 방향성 확인: fromNodeId -> toNodeId
        const fromNode = editor.getShape(fromNodeId as any)
        const toNode = editor.getShape(targetNode.id as any)
        const fromNodeName = (fromNode as any)?.props?.name || fromNodeId
        const toNodeName = (toNode as any)?.props?.name || targetNode.id
        
        console.log(`연결 생성: ${fromNodeName} -> ${toNodeName}`)
        console.log(`연결 정보:`, {
          fromNodeId,
          toNodeId: targetNode.id,
          connectionId,
        })
        
        setConnections(prev => {
          const updated = new Map(prev)
          updated.set(connectionId, {
            fromNodeId: fromNodeId,
            toNodeId: targetNode.id,
          })
          return updated
        })
        
        // 연결선 다시 그리기
        setTimeout(() => {
          drawAllConnections()
        }, 10)
      } else {
        // 허공에서 놓았을 때 모달 표시
        setNodeCreationModal({
          show: true,
          position: { x: e.clientX, y: e.clientY },
          fromNodeId: fromNodeId,
        })
      }

      setConnectionState(null)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const [currentUploadNodeId, setCurrentUploadNodeId] = useState<string | null>(null)

  const createNanobananaNode = (position: { x: number; y: number }, fromNodeId: string | null) => {
    const nodeWidth = 350
    const nodeHeight = 400
    const nodeX = position.x - nodeWidth / 2
    const nodeY = position.y - nodeHeight / 2

    // Create nanobanana execution node (using frame shape)
    editor.createShape({
      type: 'frame',
      x: nodeX,
      y: nodeY,
      props: { 
        w: nodeWidth, 
        h: nodeHeight,
        name: '나노바나나 실행 노드',
      },
    } as any)

    // Find the created node
    setTimeout(() => {
      const shapes = editor.getCurrentPageShapes()
      const nodeShape = shapes
        .filter((s) => s.type === 'frame')
        .find((s) => {
          const dx = Math.abs(s.x - nodeX)
          const dy = Math.abs(s.y - nodeY)
          return dx < 10 && dy < 10
        })
      
      const nodeId = nodeShape?.id || ''
      
      if (!nodeId) {
        console.error('Failed to find created nanobanana node')
        return
      }

      // If there's a fromNodeId, create connection
      if (fromNodeId) {
        const connectionId = `conn:${fromNodeId}:${nodeId}`
        setConnections(prev => {
          const updated = new Map(prev)
          updated.set(connectionId, {
            fromNodeId: fromNodeId,
            toNodeId: nodeId,
          })
          return updated
        })
        
        setTimeout(() => {
          drawAllConnections()
        }, 10)
      }

      // Convert node position to screen coordinates for overlay
      const nodeScreenPos = editor.pageToScreen({ x: nodeX + nodeWidth / 2, y: nodeY + nodeHeight / 2 })

      const newNodeOverlay: NodeOverlayState = {
        nodeId,
        nodeX: nodeX + nodeWidth / 2,
        nodeY: nodeY + nodeHeight / 2,
        screenX: nodeScreenPos.x,
        screenY: nodeScreenPos.y,
      }

      // Store node overlay in map
      setNodeOverlays(prev => new Map(prev).set(nodeId, newNodeOverlay))
      
      // Store nanobanana node state
      setNanobananaNodes(prev => new Map(prev).set(nodeId, { text: '', outputImageUrl: null, isLoading: false, previewImageUrl: null }))
    }, 50)
  }

  // 연결된 이미지 노드 찾기 (맨 처음 생성된 것)
  const getConnectedImageNode = (nodeId: string) => {
    const nodeConnections = getNodeConnections(nodeId)
    const incomingConnections = nodeConnections.filter(conn => conn.type === 'incoming')
    
    if (incomingConnections.length > 0) {
      // 첫 번째로 연결된 이미지 노드 찾기
      const connectedNodeId = incomingConnections[0].targetNodeId
      const connectedNode = editor.getShape(connectedNodeId as any)
      
      if (connectedNode) {
        // 연결된 노드의 자식 이미지 찾기
        const allShapes = editor.getCurrentPageShapes()
        const imageShape = allShapes.find((s) => 
          s.type === 'image' && s.parentId === connectedNodeId
        )
        return { nodeId: connectedNodeId, imageShape }
      }
    }
    return null
  }

  // 여러 이미지를 합치는 함수 (스케치 이미지 + 여러 부자재 이미지)
  const combineImages = async (
    sketchImageUrl: string | null,
    materials: Material[]
  ): Promise<string | null> => {
    if (!sketchImageUrl) return null

    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas context를 가져올 수 없습니다.'))
        return
      }

      const sketchImg = new Image()
      sketchImg.crossOrigin = 'anonymous'
      
      sketchImg.onload = () => {
        // 스케치 이미지 크기로 캔버스 설정
        canvas.width = sketchImg.width
        canvas.height = sketchImg.height

        // 스케치 이미지 그리기 (배경)
        ctx.drawImage(sketchImg, 0, 0)

        // 부자재 이미지가 없으면 스케치 이미지만 반환
        if (materials.length === 0) {
          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error('이미지 변환 실패'))
              return
            }
            const reader = new FileReader()
            reader.onloadend = () => {
              const base64 = reader.result as string
              resolve(base64.split(',')[1])
            }
            reader.onerror = reject
            reader.readAsDataURL(blob)
          }, 'image/jpeg', 0.95)
          return
        }

        // 모든 부자재 이미지를 순차적으로 로드하고 그리기
        let loadedCount = 0
        const materialImages: { img: HTMLImageElement; material: Material }[] = []

        const drawAllMaterials = () => {
          // 모든 부자재 이미지 그리기
          materialImages.forEach(({ img, material }) => {
            const materialWidth = (canvas.width * material.size.width) / 100
            const materialHeight = (canvas.height * material.size.height) / 100
            const materialX = (canvas.width * material.position.x) / 100
            const materialY = (canvas.height * material.position.y) / 100
            ctx.drawImage(img, materialX, materialY, materialWidth, materialHeight)
          })

          // 합쳐진 이미지를 base64로 변환
          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error('이미지 합치기 실패'))
              return
            }
            const reader = new FileReader()
            reader.onloadend = () => {
              const base64 = reader.result as string
              resolve(base64.split(',')[1])
            }
            reader.onerror = reject
            reader.readAsDataURL(blob)
          }, 'image/jpeg', 0.95)
        }

        materials.forEach((material) => {
          const materialImg = new Image()
          materialImg.crossOrigin = 'anonymous'
          
          materialImg.onload = () => {
            materialImages.push({ img: materialImg, material })
            loadedCount++
            if (loadedCount === materials.length) {
              drawAllMaterials()
            }
          }

          materialImg.onerror = () => {
            // 부자재 이미지 로드 실패 시에도 계속 진행 (다른 이미지는 그리기)
            loadedCount++
            if (loadedCount === materials.length) {
              drawAllMaterials()
            }
          }

          materialImg.src = material.url
        })
      }

      sketchImg.onerror = () => {
        reject(new Error('스케치 이미지 로드 실패'))
      }

      sketchImg.src = sketchImageUrl
    })
  }

  // Gemini API를 통한 이미지 생성
  const executeNanobanana = async (nodeId: string, imageUrl: string | null, prompt: string) => {
    // API 키
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY

    // 로딩 상태 설정
    setNanobananaNodes(prev => {
      const updated = new Map(prev)
      const current = prev.get(nodeId) || { text: prompt, outputImageUrl: null, isLoading: false, previewImageUrl: null }
      updated.set(nodeId, { ...current, isLoading: true })
      return updated
    })

    try {
      // 이미지가 있으면 base64로 변환
      let imageBase64: string | null = null
      if (imageUrl) {
        // 연결된 이미지 노드에서 부자재 이미지 정보도 가져오기
        const nodeConnections = getNodeConnections(nodeId)
        const incomingConnections = nodeConnections.filter(conn => conn.type === 'incoming')
        
        let sketchImageUrl: string | null = imageUrl
        let materials: Material[] = []

        if (incomingConnections.length > 0) {
          const connectedNodeId = incomingConnections[0].targetNodeId
          const connectedNode = editor.getShape(connectedNodeId as any)
          
          // 이미지 노드인지 확인
          if (connectedNode && (connectedNode as any).props?.name === '이미지 노드') {
            const imageNodeState = imageNodes.get(connectedNodeId)
            if (imageNodeState) {
              sketchImageUrl = imageNodeState.imageUrl
              materials = imageNodeState.materials || []
            }
          }
        }

        // 여러 이미지를 합쳐서 base64로 변환
        imageBase64 = await combineImages(
          sketchImageUrl,
          materials
        )
      }

      // Gemini API 호출
      const requestBody: any = {
        contents: [{
          parts: []
        }]
      }

      // 이미지가 있으면 추가
      if (imageBase64) {
        requestBody.contents[0].parts.push({
          inline_data: {
            mime_type: 'image/jpeg',
            data: imageBase64
          }
        })
      }

      // 텍스트 프롬프트 추가 (이미지 생성 요청을 명확히)
      const imagePrompt = prompt 
        ? (prompt.includes('생성') || prompt.includes('그려') || prompt.includes('만들') 
            ? prompt 
            : `${prompt} 이미지를 생성해주세요.`)
        : '이미지를 생성해주세요.'
      
      requestBody.contents[0].parts.push({
        text: imagePrompt
      })
      
      // 디버깅: 요청 본문 확인
      console.log('Gemini API 요청:', JSON.stringify(requestBody, null, 2))

      // Gemini 모델 이름 (환경 변수로 설정 가능, 기본값: gemini-2.5-flash-image)
      const modelName = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-flash-image'
      
      // Gemini API 엔드포인트 (문서 참고: https://ai.google.dev/gemini-api/docs/image-generation)
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`
      
      console.log('API 요청 URL:', apiUrl.replace(apiKey, 'KEY_HIDDEN'))
      console.log('API 요청 본문:', JSON.stringify(requestBody, null, 2))
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      })

      // 응답 상태 확인
      if (!response.ok) {
        const errorText = await response.text()
        console.error('API 에러 응답:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        })
        
        let errorMessage = `API 호출 실패 (${response.status}): ${response.statusText}`
        try {
          const errorData = JSON.parse(errorText)
          if (errorData.error?.message) {
            errorMessage = errorData.error.message
          }
        } catch (e) {
          // JSON 파싱 실패 시 원본 텍스트 사용
        }
        
        throw new Error(errorMessage)
      }

      const data = await response.json()
      
      // 디버깅: 응답 데이터 전체 확인
      console.log('Gemini API 응답:', JSON.stringify(data, null, 2))
      
      // 응답에서 이미지 추출
      let outputImageUrl: string | null = null
      
      // 에러 응답 확인
      if (data.error) {
        throw new Error(data.error.message || 'API 에러 발생')
      }
      
      // 응답 구조 확인
      if (!data.candidates || !data.candidates[0]) {
        console.error('응답에 candidates가 없습니다:', data)
        throw new Error('API 응답 형식이 올바르지 않습니다. candidates가 없습니다.')
      }

      const candidate = data.candidates[0]
      
      // finishReason 확인
      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        console.warn('finishReason:', candidate.finishReason)
        if (candidate.finishReason === 'SAFETY') {
          throw new Error('안전 필터에 의해 차단되었습니다.')
        } else if (candidate.finishReason === 'MAX_TOKENS') {
          throw new Error('최대 토큰 수를 초과했습니다.')
        }
      }

      // 문서 참고: https://ai.google.dev/gemini-api/docs/image-generation
      // JavaScript SDK의 경우 part.inlineData, REST API의 경우 part.inline_data를 사용
      if (candidate.content && candidate.content.parts) {
        const parts = candidate.content.parts
        
        console.log('========== 응답 parts 분석 ==========')
        console.log('Parts 개수:', parts.length)
        
        // 이미지가 포함된 경우 찾기 (문서에 따른 정확한 형식)
        for (const part of parts) {
          // REST API 형식: inline_data
          if (part.inline_data && part.inline_data.data) {
            console.log('inline_data 이미지 발견 (REST API 형식)')
            const base64Data = part.inline_data.data
            const mimeType = part.inline_data.mime_type || 'image/png'
            
            try {
              // base64 데이터를 직접 디코딩하여 blob 생성
              // base64 문자열을 바이너리로 변환
              const binaryString = atob(base64Data)
              const bytes = new Uint8Array(binaryString.length)
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i)
              }
              const blob = new Blob([bytes], { type: mimeType })
              outputImageUrl = URL.createObjectURL(blob)
              console.log('이미지 URL 생성 성공 (REST API):', outputImageUrl)
              break
            } catch (e) {
              console.error('이미지 변환 실패:', e)
            }
          }
          
          // JavaScript SDK 형식: inlineData (혹시 모를 경우 대비)
          if (part.inlineData && part.inlineData.data) {
            console.log('inlineData 이미지 발견 (SDK 형식)')
            const base64Data = part.inlineData.data
            const mimeType = part.inlineData.mimeType || 'image/png'
            
            try {
              const binaryString = atob(base64Data)
              const bytes = new Uint8Array(binaryString.length)
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i)
              }
              const blob = new Blob([bytes], { type: mimeType })
              outputImageUrl = URL.createObjectURL(blob)
              console.log('이미지 URL 생성 성공 (SDK):', outputImageUrl)
              break
            } catch (e) {
              console.error('이미지 변환 실패:', e)
            }
          }
          
          // 텍스트 응답 (디버깅용)
          if (part.text) {
            console.log('텍스트 응답:', part.text.substring(0, 200))
          }
        }
        
        // 각 part의 상세 정보 로깅 (디버깅용)
        parts.forEach((part: any, index: number) => {
          console.log(`Part ${index} 구조:`, {
            keys: Object.keys(part),
            hasText: !!part.text,
            hasInlineData: !!part.inline_data,
            hasInlineDataSDK: !!part.inlineData,
            inlineDataType: part.inline_data ? typeof part.inline_data : null,
            inlineDataKeys: part.inline_data ? Object.keys(part.inline_data) : null
          })
        })
      }

      if (!outputImageUrl) {
        // 모든 parts 확인
        console.error('========== 이미지를 찾을 수 없습니다 ==========')
        console.error('전체 API 응답:', JSON.stringify(data, null, 2))
        console.error('응답 구조 분석:', {
          hasCandidates: !!data.candidates,
          candidateCount: data.candidates?.length || 0,
          firstCandidate: data.candidates?.[0],
          partsCount: data.candidates?.[0]?.content?.parts?.length || 0,
          parts: data.candidates?.[0]?.content?.parts
        })
        
        // 텍스트 응답이 있는지 확인
        const textParts = data.candidates?.[0]?.content?.parts?.filter((p: any) => p.text) || []
        if (textParts.length > 0) {
          const allText = textParts.map((p: any) => p.text).join('\n')
          console.error('텍스트 응답:', allText)
          
          // 사용자에게 더 자세한 정보 제공
          const errorMsg = `이미지가 생성되지 않았습니다.\n\n` +
            `응답 내용:\n${allText.substring(0, 500)}\n\n` +
            `전체 응답은 브라우저 콘솔(F12)에서 확인할 수 있습니다.`
          
          alert(errorMsg)
          throw new Error(`이미지 생성 실패: ${allText.substring(0, 200)}`)
        } else {
          // parts가 없거나 다른 형식인 경우
          const partsInfo = data.candidates?.[0]?.content?.parts?.map((p: any, i: number) => ({
            index: i,
            keys: Object.keys(p),
            type: typeof p,
            sample: JSON.stringify(p).substring(0, 100)
          })) || []
          
          console.error('Parts 정보:', partsInfo)
          
          const errorMsg = `이미지 생성에 실패했습니다.\n\n` +
            `응답에 이미지 데이터가 없습니다.\n` +
            `응답 구조:\n- Candidates: ${data.candidates?.length || 0}개\n` +
            `- Parts: ${data.candidates?.[0]?.content?.parts?.length || 0}개\n\n` +
            `자세한 내용은 브라우저 콘솔(F12)을 확인하세요.`
          
          alert(errorMsg)
          throw new Error('이미지 생성에 실패했습니다. 응답 형식을 확인해주세요. 브라우저 콘솔을 확인해주세요.')
        }
      }

      // 출력 이미지 URL 저장
      setNanobananaNodes(prev => {
        const updated = new Map(prev)
        const current = prev.get(nodeId) || { text: prompt, outputImageUrl: null, isLoading: false, previewImageUrl: null }
        updated.set(nodeId, { ...current, outputImageUrl, isLoading: false })
        return updated
      })
    } catch (error) {
      console.error('나노바나나 실행 오류:', error)
      alert(`이미지 생성 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`)
      setNanobananaNodes(prev => {
        const updated = new Map(prev)
        const current = prev.get(nodeId) || { text: prompt, outputImageUrl: null, isLoading: false, previewImageUrl: null }
        updated.set(nodeId, { ...current, isLoading: false })
        return updated
      })
    }
  }

  const handleNodeFileChoose = (nodeId: string) => {
    // 스케치 이미지 선택 모달 열기
    setCurrentSketchNodeId(nodeId)
    setSketchModalOpen(true)
  }

  const handleNodeFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0 || !currentUploadNodeId) return

    const file = files[0]
    if (!file.type.startsWith('image/')) return

    try {
      // 기존 이미지 URL 해제 (메모리 누수 방지)
      setImageNodes(prev => {
        const current = prev.get(currentUploadNodeId)
        if (current?.imageUrl) {
          URL.revokeObjectURL(current.imageUrl)
        }
        return prev
      })

      // 이미지 파일을 URL로 변환하여 저장
      const imageUrl = URL.createObjectURL(file)
      
      // 이미지 노드 상태에 이미지 URL 저장 (기존 materials 유지)
      setImageNodes(prev => {
        const updated = new Map(prev)
        const current = prev.get(currentUploadNodeId) || { 
          imageUrl: null, 
          materials: []
        }
        updated.set(currentUploadNodeId, { ...current, imageUrl })
        return updated
      })

      setCurrentUploadNodeId(null)
    } catch (error) {
      console.error('Failed to upload image to node:', error)
      setCurrentUploadNodeId(null)
    }
  }

  const getImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        resolve({ width: img.width, height: img.height })
      }
      img.onerror = reject
      img.src = url
    })
  }

  // 프로젝트 저장
  const saveProject = () => {
    try {
      // Tldraw 모든 레코드 가져오기
      const allRecords = editor.store.allRecords()
      
      // 모든 상태를 직렬화 가능한 형태로 변환
      const projectData = {
        version: '1.0.0',
        savedAt: new Date().toISOString(),
        tldrawRecords: allRecords,
        nodeOverlays: Array.from(nodeOverlays.entries()),
        connections: Array.from(connections.entries()),
        imageNodes: Array.from(imageNodes.entries()).map(([nodeId, nodeData]) => {
          // blob URL은 저장할 수 없으므로, 이미지가 blob URL인 경우 경고
          let imageUrl = nodeData.imageUrl
          if (imageUrl && imageUrl.startsWith('blob:')) {
            // blob URL은 저장할 수 없으므로 null로 설정
            imageUrl = null
          }
          return [nodeId, { ...nodeData, imageUrl }]
        }),
        nanobananaNodes: Array.from(nanobananaNodes.entries()),
      }

      // JSON으로 변환
      const jsonString = JSON.stringify(projectData, null, 2)
      
      // 파일로 다운로드
      const blob = new Blob([jsonString], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `project-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      alert('프로젝트가 저장되었습니다.')
    } catch (error) {
      console.error('프로젝트 저장 실패:', error)
      alert('프로젝트 저장에 실패했습니다.')
    }
  }

  // 프로젝트 불러오기
  const loadProject = async (file: File) => {
    try {
      const text = await file.text()
      const projectData = JSON.parse(text)

      // 버전 확인
      if (!projectData.version) {
        alert('지원하지 않는 프로젝트 형식입니다.')
        return
      }

      // 확인 메시지
      if (!confirm('현재 프로젝트를 불러오면 모든 변경사항이 사라집니다. 계속하시겠습니까?')) {
        return
      }

      // 기존 blob URL 정리
      imageNodes.forEach((nodeData) => {
        if (nodeData.imageUrl && nodeData.imageUrl.startsWith('blob:')) {
          URL.revokeObjectURL(nodeData.imageUrl)
        }
      })

      // Tldraw 레코드 복원
      if (projectData.tldrawRecords && Array.isArray(projectData.tldrawRecords)) {
        // 페이지 레코드를 먼저 찾아서 먼저 복원
        const pageRecords = projectData.tldrawRecords.filter((r: any) => r.typeName === 'page')
        const otherRecords = projectData.tldrawRecords.filter((r: any) => r.typeName !== 'page')
        
        // 기존 레코드 ID 맵 생성
        const currentRecords = editor.store.allRecords()
        const savedRecordIds = new Set(projectData.tldrawRecords.map((r: any) => r.id))
        
        // 삭제할 레코드 (저장된 파일에 없는 레코드)
        const recordsToRemove = currentRecords.filter(r => !savedRecordIds.has(r.id))
        
        // 페이지 레코드를 먼저 복원 (업데이트 또는 추가)
        if (pageRecords.length > 0) {
          editor.store.put(pageRecords)
        }
        
        // 나머지 레코드를 배치로 추가/업데이트
        if (otherRecords.length > 0) {
          editor.store.put(otherRecords)
        }
        
        // 삭제할 레코드 처리 (페이지 레코드를 제외한 나머지 먼저 삭제)
        if (recordsToRemove.length > 0) {
          const nonPageRecordsToRemove = recordsToRemove.filter(r => r.typeName !== 'page')
          if (nonPageRecordsToRemove.length > 0) {
            editor.store.remove(nonPageRecordsToRemove.map(r => r.id))
          }
          
          // 페이지 레코드는 약간의 지연을 두고 삭제 (다른 레코드가 먼저 복원된 후)
          const pageRecordsToRemove = recordsToRemove.filter(r => r.typeName === 'page')
          if (pageRecordsToRemove.length > 0) {
            setTimeout(() => {
              try {
                editor.store.remove(pageRecordsToRemove.map(r => r.id))
              } catch (e) {
                console.error('페이지 레코드 삭제 실패:', e)
              }
            }, 200)
          }
        }
      }

      // 상태 복원
      if (projectData.nodeOverlays) {
        setNodeOverlays(new Map(projectData.nodeOverlays))
      }

      if (projectData.connections) {
        setConnections(new Map(projectData.connections))
      }

      if (projectData.imageNodes) {
        setImageNodes(new Map(projectData.imageNodes))
      }

      if (projectData.nanobananaNodes) {
        setNanobananaNodes(new Map(projectData.nanobananaNodes))
      }

      alert('프로젝트가 불러와졌습니다.')
    } catch (error) {
      console.error('프로젝트 불러오기 실패:', error)
      alert('프로젝트 불러오기에 실패했습니다. 파일 형식을 확인해주세요.')
    }
  }

  // 프로젝트 불러오기 핸들러
  const handleProjectFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const file = files[0]
    if (!file.name.endsWith('.json')) {
      alert('JSON 파일만 불러올 수 있습니다.')
      return
    }

    await loadProject(file)
    
    // 파일 입력 초기화
    if (projectFileInputRef.current) {
      projectFileInputRef.current.value = ''
    }
  }

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0 || !overlay) return

    const file = files[0]
    if (!file.type.startsWith('image/')) return

    try {
      // Get frame shape first to ensure it exists
      const frameShape = editor.getShape(overlay.frameId as any)
      
      if (!frameShape) {
        console.error('Frame not found')
        return
      }

      // Get image dimensions for size calculation
      const imgDims = await getImageDimensions(file)
      const imgAspectRatio = imgDims.width / imgDims.height
      const frameAspectRatio = overlay.frameWidth / overlay.frameHeight

      // Calculate size to fit frame while maintaining aspect ratio
      let targetWidth: number
      let targetHeight: number

      if (imgAspectRatio > frameAspectRatio) {
        // Image is wider - fit to frame width
        targetWidth = overlay.frameWidth
        targetHeight = overlay.frameWidth / imgAspectRatio
      } else {
        // Image is taller - fit to frame height
        targetHeight = overlay.frameHeight
        targetWidth = overlay.frameHeight * imgAspectRatio
      }

      // Calculate position in frame's local coordinate system (relative to frame)
      const imageXInFrame = (overlay.frameWidth - targetWidth) / 2
      const imageYInFrame = (overlay.frameHeight - targetHeight) / 2

      // Convert frame-relative coordinates to page coordinates for initial creation
      const frameX = frameShape.x
      const frameY = frameShape.y
      const imageX = frameX + imageXInFrame
      const imageY = frameY + imageYInFrame

      // Get current selection count to track newly created shape
      const shapesBefore = editor.getCurrentPageShapes().map(s => s.id)
      
      // Use tldraw's official file upload handler
      // This properly handles asset creation and storage
      await defaultHandleExternalFileContent(
        editor,
        { 
          files: [file], 
          point: { x: imageX, y: imageY }
        },
        {
          toasts: {
            add: () => {},
            remove: () => {},
            clearToasts: () => {},
          } as any,
          msg: (key: string) => key,
        } as any
      )

      // Wait a bit for the shape to be fully created
      await new Promise(resolve => setTimeout(resolve, 150))

      // Find the newly created image shape
      const shapesAfter = editor.getCurrentPageShapes()
      const imageShape = shapesAfter
        .filter((s) => s.type === 'image' && !shapesBefore.includes(s.id))
        .find((s) => {
          const dx = Math.abs(s.x - imageX)
          const dy = Math.abs(s.y - imageY)
          return dx < 100 && dy < 100
        })

      if (imageShape) {
        // First, set the parent to convert to frame coordinate system
        editor.updateShape({
          id: imageShape.id,
          type: 'image',
          parentId: overlay.frameId,
        } as any)

        // Wait for coordinate system conversion
        await new Promise(resolve => setTimeout(resolve, 50))

        // Now update position and size in frame coordinates
        editor.updateShape({
          id: imageShape.id,
          type: 'image',
          x: imageXInFrame,
          y: imageYInFrame,
          parentId: overlay.frameId,
          props: {
            w: targetWidth,
            h: targetHeight,
          },
        } as any)

        // Wait for update to complete
        await new Promise(resolve => setTimeout(resolve, 100))

        // Verify and fix size if needed
        const updatedShape = editor.getShape(imageShape.id)
        if (updatedShape) {
          const currentProps = (updatedShape as any).props
          const needsSizeUpdate = 
            Math.abs((currentProps?.w || 0) - targetWidth) > 1 || 
            Math.abs((currentProps?.h || 0) - targetHeight) > 1

          if (updatedShape.parentId !== overlay.frameId || needsSizeUpdate) {
            // Update again with correct size and parent
            editor.updateShape({
              id: imageShape.id,
              type: 'image',
              x: imageXInFrame,
              y: imageYInFrame,
              parentId: overlay.frameId,
              props: {
                w: targetWidth,
                h: targetHeight,
              },
            } as any)
          }
        }
      } else {
        console.error('Failed to find created image shape')
      }
    } catch (error) {
      console.error('Failed to upload image:', error)
    } finally {
      setOverlay(null)
    }
  }

  return (
    <>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'flex', gap: 8, padding: 8, justifyContent: 'center', zIndex: 1000, pointerEvents: 'auto' }}>
        {/* 1) 사각형 추가 */}
        <button
          onClick={addCenteredRect}
          aria-label="사각형 추가"
          title="사각형 추가"
          style={{
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid #ccc',
            borderRadius: 6,
            background: 'white',
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          +
        </button>

        {/* 2) 이미지 추가 (프레임 생성 + 업로드 버튼 표시) */}
        <button
          onClick={addFrameWithUpload}
          aria-label="이미지 추가"
          title="이미지 추가"
          style={{
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid #ccc',
            borderRadius: 6,
            background: 'white',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          🖼️
        </button>

        {/* 3) 이미지 업로드 노드 추가 */}
        <button
          onClick={addImageNode}
          aria-label="이미지 노드 추가"
          title="이미지 노드 추가"
          style={{
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid #ccc',
            borderRadius: 6,
            background: 'white',
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          ▢
        </button>

        {/* 4) 프로젝트 저장 */}
        <button
          onClick={saveProject}
          aria-label="프로젝트 저장"
          title="프로젝트 저장"
          style={{
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid #ccc',
            borderRadius: 6,
            background: 'white',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          💾
        </button>

        {/* 5) 프로젝트 불러오기 */}
        <button
          onClick={() => projectFileInputRef.current?.click()}
          aria-label="프로젝트 불러오기"
          title="프로젝트 불러오기"
          style={{
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid #ccc',
            borderRadius: 6,
            background: 'white',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          📂
        </button>
      </div>

      {/* 숨겨진 파일 입력 (프레임용) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFilesSelected}
      />

      {/* 숨겨진 파일 입력 (노드용) */}
      <input
        ref={nodeFileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleNodeFileSelected}
      />

      {/* 숨겨진 파일 입력 (프로젝트 불러오기용) */}
      <input
        ref={projectFileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleProjectFileSelected}
      />

      {/* 프레임 안 업로드 버튼 (화면 중앙에 오버레이) */}
      {overlay && (
        <div
          style={{
            position: 'fixed',
            left: overlay.screenCenter.x,
            top: overlay.screenCenter.y,
            transform: 'translate(-50%, -50%)',
            zIndex: 1100,
            pointerEvents: 'auto',
          }}
        >
          <button
            onClick={handleChooseFile}
            style={{
              padding: '8px 12px',
              border: `1px solid ${themeColors.border}`,
              borderRadius: 8,
              background: themeColors.buttonBg,
              color: themeColors.text,
              cursor: 'pointer',
              fontSize: 14,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = themeColors.buttonHover
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = themeColors.buttonBg
            }}
          >
            이미지 업로드
          </button>
        </div>
      )}


      {/* 모든 노드의 연결 핀 (우측 상단) */}
      {Array.from(nodeOverlays.values()).map((node) => {
        const nodeShape = editor.getShape(node.nodeId as any)
        if (!nodeShape) return null

        const nodeX = nodeShape.x
        const nodeY = nodeShape.y
        const nodeWidth = (nodeShape as any).props?.w || 300
        const nodeName = (nodeShape as any).props?.name || ''
        const outputPinPos = editor.pageToScreen({ x: nodeX + nodeWidth, y: nodeY + 20 })

        // 나노바나나 실행 노드는 연결 핀을 표시하지 않음
        if (nodeName === '나노바나나 실행 노드') {
          return null
        }

        return (
          <div
            key={node.nodeId}
            style={{
              position: 'fixed',
              left: outputPinPos.x,
              top: outputPinPos.y,
              transform: 'translate(-50%, -50%)',
              zIndex: 1100,
              pointerEvents: 'auto',
            }}
          >
            <button
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                handleConnectionStart(node.nodeId, e.clientX, e.clientY)
              }}
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                border: '2px solid #007acc',
                background: '#007acc',
                cursor: 'grab',
                padding: 0,
              }}
              title="드래그하여 연결"
            />
          </div>
        )
      })}

      {/* 이미지 노드 오버레이 */}
      {Array.from(nodeOverlays.values())
        .filter((node) => {
          const nodeShape = editor.getShape(node.nodeId as any)
          return nodeShape && (nodeShape as any).props?.name === '이미지 노드'
        })
        .map((node) => {
          const nodeId = node.nodeId
          const nodeShape = editor.getShape(nodeId as any)
          if (!nodeShape) return null

          const nodeX = nodeShape.x
          const nodeY = nodeShape.y
          const nodeWidth = (nodeShape as any).props?.w || 350
          const nodeHeight = (nodeShape as any).props?.h || 400
          const nodeScreenPos = editor.pageToScreen({ x: nodeX, y: nodeY })
          const imageNodeState = imageNodes.get(nodeId) || { 
            imageUrl: null, 
            materials: []
          }

        return (
          <div
            key={nodeId}
            data-image-node-overlay
            style={{
              position: 'fixed',
              left: nodeScreenPos.x,
              top: nodeScreenPos.y,
              width: nodeWidth,
              height: nodeHeight,
              zIndex: 1100,
              pointerEvents: 'auto',
              padding: '12px',
              boxSizing: 'border-box',
              transform: `scale(${zoomLevel})`,
              transformOrigin: 'top left',
              background: themeColors.background,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* 이미지 표시 영역 */}
            <div
              data-image-area
              style={{
                width: '100%',
                height: 'calc(100% - 62px)',
                border: imageNodeState.imageUrl ? `1px solid ${themeColors.border}` : `2px dashed ${themeColors.borderDashed}`,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: imageNodeState.imageUrl ? themeColors.surface : themeColors.placeholder,
                marginBottom: '12px',
                overflow: 'hidden',
                position: 'relative',
              }}
              onClick={(e) => {
                e.stopPropagation()
                // 이미지 표시 영역 내부 클릭 시 선택 유지 (부자재 이미지를 다시 클릭하면 선택 해제)
              }}
            >
              {imageNodeState.imageUrl ? (
                <>
                  {/* 스케치 이미지 (배경) */}
                  <img
                    src={imageNodeState.imageUrl}
                    alt="Uploaded"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                    }}
                  />
                  {/* 부자재 이미지들 (오버레이) - 드래그 및 리사이즈 가능 */}
                  {imageNodeState.materials.map((material) => {
                    const isSelected = selectedMaterial?.nodeId === nodeId && selectedMaterial?.materialId === material.id
                    const isDragging = draggingMaterial?.nodeId === nodeId && draggingMaterial?.materialId === material.id
                    const isResizing = resizingMaterial?.nodeId === nodeId && resizingMaterial?.materialId === material.id
                    
                    return (
                      <div
                        key={material.id}
                        data-material-image
                        style={{
                          position: 'absolute',
                          left: `${material.position.x}%`,
                          top: `${material.position.y}%`,
                          width: `${material.size.width}%`,
                          height: `${material.size.height}%`,
                          zIndex: 2,
                          cursor: isDragging ? 'grabbing' : (isSelected || isDragging || isResizing ? 'grab' : 'pointer'),
                          border: (isSelected || isDragging || isResizing) ? '2px solid #007acc' : 'none',
                          borderRadius: 4,
                          boxSizing: 'border-box',
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          // 클릭 시 항상 선택 상태로 설정
                          setSelectedMaterial({ nodeId, materialId: material.id })
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          // 리사이즈 핸들이 아닐 때만 드래그 시작
                          if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'IMG') {
                            const containerRect = e.currentTarget.parentElement?.getBoundingClientRect()
                            if (containerRect) {
                              const offsetX = ((e.clientX - containerRect.left) / containerRect.width) * 100 - material.position.x
                              const offsetY = ((e.clientY - containerRect.top) / containerRect.height) * 100 - material.position.y
                              setDraggingMaterial({
                                nodeId,
                                materialId: material.id,
                                startX: e.clientX,
                                startY: e.clientY,
                                offsetX,
                                offsetY,
                              })
                              setSelectedMaterial({ nodeId, materialId: material.id })
                            }
                          }
                        }}
                      >
                        <img
                          src={material.url}
                          alt="Material"
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                            pointerEvents: 'none',
                            userSelect: 'none',
                          }}
                          draggable={false}
                        />
                        {/* 리사이즈 핸들 (우측 하단) - 선택 상태일 때만 표시 */}
                        {(isSelected || isDragging || isResizing) && (
                          <div
                            data-resize-handle
                            style={{
                              position: 'absolute',
                              right: -6,
                              bottom: -6,
                              width: 12,
                              height: 12,
                              background: '#007acc',
                              border: '2px solid white',
                              borderRadius: '50%',
                              cursor: 'nwse-resize',
                              zIndex: 3,
                            }}
                            onClick={(e) => {
                              e.stopPropagation()
                            }}
                            onMouseDown={(e) => {
                              e.stopPropagation()
                              e.preventDefault()
                              setResizingMaterial({
                                nodeId,
                                materialId: material.id,
                                startX: e.clientX,
                                startY: e.clientY,
                                startWidth: material.size.width,
                                startHeight: material.size.height,
                              })
                              setSelectedMaterial({ nodeId, materialId: material.id })
                            }}
                          />
                        )}
                        {/* 삭제 버튼 (우측 상단) - 선택 상태일 때만 표시 */}
                        {(isSelected || isDragging || isResizing) && (
                          <div
                            data-delete-handle
                            style={{
                              position: 'absolute',
                              right: -6,
                              top: -6,
                              width: 17,
                              height: 17,
                              background: '#ff4444',
                              border: '2px solid white',
                              borderRadius: '50%',
                              cursor: 'pointer',
                              zIndex: 3,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '10px',
                              color: 'white',
                              fontWeight: 'bold',
                            }}
                            onClick={(e) => {
                              e.stopPropagation()
                              setImageNodes(prev => {
                                const updated = new Map(prev)
                                const current = prev.get(nodeId)
                                if (current) {
                                  updated.set(nodeId, {
                                    ...current,
                                    materials: current.materials.filter(m => m.id !== material.id)
                                  })
                                }
                                return updated
                              })
                              setSelectedMaterial(null)
                            }}
                          >
                            ×
                          </div>
                        )}
                      </div>
                    )
                  })}
                </>
              ) : (
                <span style={{ fontSize: '48px' }}>🖼️</span>
              )}
            </div>

            {/* 업로드 버튼 */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleNodeFileChoose(nodeId)
              }}
              onMouseDown={(e) => {
                e.stopPropagation()
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: `1px solid ${themeColors.border}`,
                borderRadius: 8,
                background: themeColors.buttonBg,
                color: themeColors.text,
                cursor: 'pointer',
                fontSize: 14,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = themeColors.buttonHover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = themeColors.buttonBg
              }}
            >
              {imageNodeState.imageUrl ? '이미지 변경' : '이미지 업로드'}
            </button>
          </div>
        )
      })}

      {/* 부자재 버튼 (이미지 노드에 스케치 이미지가 추가된 경우) */}
      {Array.from(nodeOverlays.values())
        .filter((node) => {
          const nodeShape = editor.getShape(node.nodeId as any)
          if (!nodeShape || (nodeShape as any).props?.name !== '이미지 노드') return false
          const imageNodeState = imageNodes.get(node.nodeId)
          return imageNodeState?.imageUrl !== null && imageNodeState?.imageUrl !== undefined
        })
        .map((node) => {
          const nodeId = node.nodeId
          const nodeShape = editor.getShape(nodeId as any)
          if (!nodeShape) return null

          const nodeX = nodeShape.x
          const nodeY = nodeShape.y
          const nodeWidth = (nodeShape as any).props?.w || 350
          
          // 프레임 상단 중앙 위치 계산 (프레임 외부 상단)
          const frameTopCenter = editor.pageToScreen({ 
            x: nodeX + nodeWidth / 2, 
            y: nodeY 
          })
          
          // 버튼 높이 (외부에 배치하기 위해 음수 오프셋)
          const buttonHeight = 36
          const buttonOffset = 8 // 프레임과의 간격

          return (
            <div
              key={`material-${nodeId}`}
              data-material-button
              style={{
                position: 'fixed',
                left: frameTopCenter.x,
                top: frameTopCenter.y - buttonHeight - buttonOffset,
                transform: 'translate(-50%, 0)',
                zIndex: 1101,
                pointerEvents: 'auto',
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setCurrentMaterialNodeId(nodeId)
                  setMaterialModalOpen(true)
                }}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: 6,
                  background: '#000000',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#333333'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#000000'
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                부자재
              </button>
            </div>
          )
        })}

      {/* 나노바나나 실행 노드 오버레이 */}
      {Array.from(nanobananaNodes.keys()).map((nodeId) => {
        const nodeShape = editor.getShape(nodeId as any)
        if (!nodeShape) return null

        const nodeName = (nodeShape as any).props?.name
        if (nodeName !== '나노바나나 실행 노드') return null

        const nodeX = nodeShape.x
        const nodeY = nodeShape.y
        const nodeWidth = (nodeShape as any).props?.w || 350
        const nodeHeight = (nodeShape as any).props?.h || 400
        const nodeScreenPos = editor.pageToScreen({ x: nodeX, y: nodeY })
        const nodeState = nanobananaNodes.get(nodeId) || { text: '', outputImageUrl: null, isLoading: false, previewImageUrl: null }
        
        // 연결된 이미지 노드의 프리뷰 이미지 사용
        const imageUrl = nodeState.previewImageUrl

        return (
          <div
            key={nodeId}
            style={{
              position: 'fixed',
              left: nodeScreenPos.x,
              top: nodeScreenPos.y,
              width: nodeWidth,
              height: nodeHeight,
              zIndex: 1100,
              pointerEvents: 'auto',
              padding: '12px 12px 6px 12px',
              boxSizing: 'border-box',
              transform: `scale(${zoomLevel})`,
              transformOrigin: 'top left',
              background: themeColors.background,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* 상단: 출력 이미지 플레이스홀더 또는 출력 이미지 */}
            <div
              style={{
                width: '100%',
                height: '240px',
                border: nodeState.outputImageUrl ? `1px solid ${themeColors.border}` : `2px dashed ${themeColors.borderDashed}`,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: nodeState.outputImageUrl ? themeColors.surface : themeColors.placeholder,
                marginBottom: '12px',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              {nodeState.outputImageUrl ? (
                <img
                  src={nodeState.outputImageUrl}
                  alt="Generated"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                  }}
                />
              ) : (
                <span style={{ fontSize: '48px' }}>🖼️</span>
              )}
              {nodeState.isLoading && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(0,0,0,0.5)',
                    color: 'white',
                    fontSize: '14px',
                  }}
                >
                  생성 중...
                </div>
              )}
            </div>

            {/* 중간: 연결된 이미지 노드의 이미지 */}
            {imageUrl && (
              <div
                style={{
                  width: '50px',
                  height: '50px',
                  marginBottom: '12px',
                  border: `1px solid ${themeColors.border}`,
                  borderRadius: 4,
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: themeColors.surface,
                }}
              >
                <img
                  src={imageUrl}
                  alt="Source"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
              </div>
            )}

            {/* 하단: 텍스트 입력 창 */}
            <div style={{ position: 'relative', marginBottom: '0px' }}>
              <textarea
                value={nodeState.text}
                onChange={(e) => {
                  setNanobananaNodes(prev => {
                    const updated = new Map(prev)
                    const current = prev.get(nodeId) || { text: '', outputImageUrl: null, isLoading: false, previewImageUrl: null }
                    updated.set(nodeId, { ...current, text: e.target.value })
                    return updated
                  })
                }}
                placeholder="텍스트를 입력하세요..."
                style={{
                  width: '100%',
                  minHeight: '60px',
                  padding: '8px',
                  border: `1px solid ${themeColors.border}`,
                  borderRadius: 4,
                  fontSize: '14px',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  background: themeColors.surface,
                  color: themeColors.text,
                }}
                onMouseDown={(e) => e.stopPropagation()}
              />

              {/* 우측 하단: 실행 버튼 */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  executeNanobanana(nodeId, imageUrl, nodeState.text)
                }}
                disabled={nodeState.isLoading}
                style={{
                  position: 'absolute',
                  right: '8px',
                  bottom: '8px',
                  padding: '6px 12px',
                  border: '1px solid #007acc',
                  borderRadius: 4,
                  background: nodeState.isLoading ? '#ccc' : '#007acc',
                  color: 'white',
                  cursor: nodeState.isLoading ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  opacity: nodeState.isLoading ? 0.6 : 1,
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <span>▶</span>
                {nodeState.isLoading ? '생성 중...' : '실행'}
              </button>
            </div>
          </div>
        )
      })}

      {/* 연결선 Canvas (nodebasedtest 패턴) */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 999,
        }}
      />

      {/* 연결 중 미리보기 선 (베지어 커브) */}
      {connectionState && (
        <svg
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 1000,
          }}
        >
          <path
            d={`M ${connectionState.fromScreenX} ${connectionState.fromScreenY} C ${
              connectionState.fromScreenX + Math.abs(connectionState.currentX - connectionState.fromScreenX) * 0.5
            } ${connectionState.fromScreenY}, ${
              connectionState.currentX - Math.abs(connectionState.currentX - connectionState.fromScreenX) * 0.5
            } ${connectionState.currentY}, ${connectionState.currentX} ${connectionState.currentY}`}
            stroke="#007acc"
            strokeWidth="2"
            fill="none"
          />
        </svg>
      )}

      {/* 스케치 이미지 선택 모달 */}
      {sketchModalOpen && (
        <>
          {/* 모달 배경 (외부 클릭 시 닫기) */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1199,
              pointerEvents: 'auto',
              background: 'rgba(0, 0, 0, 0.5)',
            }}
            onClick={() => {
              setSketchModalOpen(false)
              setCurrentSketchNodeId(null)
            }}
          />
          <div
            style={{
              position: 'fixed',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 1200,
              pointerEvents: 'auto',
              background: themeColors.background,
              border: `1px solid ${themeColors.border}`,
              borderRadius: 12,
              padding: '24px',
              boxShadow: isDarkMode ? '0 8px 24px rgba(0,0,0,0.5)' : '0 8px 24px rgba(0,0,0,0.2)',
              minWidth: '600px',
              maxWidth: '900px',
              maxHeight: '80vh',
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ 
              marginBottom: '20px', 
              fontWeight: 'bold', 
              fontSize: '18px', 
              color: themeColors.text,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span>신발 스케치 선택</span>
              <button
                onClick={() => {
                  setSketchModalOpen(false)
                  setCurrentSketchNodeId(null)
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: themeColors.text,
                  cursor: 'pointer',
                  fontSize: '24px',
                  lineHeight: 1,
                  padding: 0,
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '4px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = themeColors.buttonHover
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                ×
              </button>
            </div>

            {/* 카테고리 선택 탭 */}
            <div style={{ 
              display: 'flex', 
              gap: '8px', 
              marginBottom: '20px',
              borderBottom: `1px solid ${themeColors.border}`,
            }}>
              <button
                onClick={() => setSelectedSketchCategory('men')}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderBottom: selectedSketchCategory === 'men' ? '2px solid #007acc' : '2px solid transparent',
                  background: 'transparent',
                  color: selectedSketchCategory === 'men' ? themeColors.text : themeColors.textSecondary,
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: selectedSketchCategory === 'men' ? 'bold' : 'normal',
                }}
              >
                남성
              </button>
              <button
                onClick={() => setSelectedSketchCategory('women')}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderBottom: selectedSketchCategory === 'women' ? '2px solid #007acc' : '2px solid transparent',
                  background: 'transparent',
                  color: selectedSketchCategory === 'women' ? themeColors.text : themeColors.textSecondary,
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: selectedSketchCategory === 'women' ? 'bold' : 'normal',
                }}
              >
                여성
              </button>
            </div>

            {/* 남성 카테고리 하위 선택 (남성 선택 시에만 표시) */}
            {selectedSketchCategory === 'men' && (
              <div style={{ 
                display: 'flex', 
                gap: '8px', 
                marginBottom: '20px',
                flexWrap: 'wrap',
              }}>
                {['boatShoes', 'boots', 'derby', 'etc', 'laceups&monks', 'loafers'].map((category) => (
                  <button
                    key={category}
                    onClick={() => setSelectedMenCategory(category)}
                    style={{
                      padding: '6px 12px',
                      border: `1px solid ${selectedMenCategory === category ? '#007acc' : themeColors.border}`,
                      borderRadius: 6,
                      background: selectedMenCategory === category ? '#007acc' : themeColors.buttonBg,
                      color: selectedMenCategory === category ? 'white' : themeColors.text,
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    {category === 'boatShoes' ? '보트슈즈' :
                     category === 'boots' ? '부츠' :
                     category === 'derby' ? '더비' :
                     category === 'etc' ? '기타' :
                     category === 'laceups&monks' ? '레이스업&몽크' :
                     '로퍼'}
                  </button>
                ))}
              </div>
            )}

            {/* 여성 카테고리 하위 선택 (여성 선택 시에만 표시) */}
            {selectedSketchCategory === 'women' && (
              <div style={{ 
                display: 'flex', 
                gap: '8px', 
                marginBottom: '20px',
                flexWrap: 'wrap',
              }}>
                {['boots', 'flats', 'heels', 'loafers', 'sandal', 'sneakers'].map((category) => (
                  <button
                    key={category}
                    onClick={() => setSelectedWomenCategory(category)}
                    style={{
                      padding: '6px 12px',
                      border: `1px solid ${selectedWomenCategory === category ? '#007acc' : themeColors.border}`,
                      borderRadius: 6,
                      background: selectedWomenCategory === category ? '#007acc' : themeColors.buttonBg,
                      color: selectedWomenCategory === category ? 'white' : themeColors.text,
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    {category === 'boots' ? '부츠' :
                     category === 'flats' ? '플랫' :
                     category === 'heels' ? '힐' :
                     category === 'loafers' ? '로퍼' :
                     category === 'sandal' ? '샌들' :
                     '스니커즈'}
                  </button>
                ))}
              </div>
            )}

            {/* 이미지 그리드 */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: '16px',
            }}>
              {selectedSketchCategory === 'men' ? (
                // 남성 신발 이미지들 (선택된 카테고리에 따라)
                (() => {
                  // 실제 파일명을 정확히 반영 (영어 파일명)
                  const menImageMap: Record<string, string[]> = {
                    boatShoes: ['boatShoes.png', 'boatShoes2.png'],
                    boots: ['boots.png', 'boots2.png', 'boots3.png', 'boots4.png'],
                    derby: ['derby.png'],
                    etc: ['derby.png', 'oxford.png', 'plaintoe.png', 'wingtip.png'],
                    'laceups&monks': ['laceUp.png', 'monkStrap.png', 'monkStrap2.png', 'monkStrap3.png'],
                    loafers: ['loafer.png', 'loafer2.png', 'loafer3.png', 'loafer4.png'],
                  }
                  
                  const images = menImageMap[selectedMenCategory] || []
                  
                  // 이미지가 없으면 빈 배열 반환
                  if (images.length === 0) {
                    return []
                  }
                  
                  // 파일명을 한글 표시명으로 변환
                  const displayNameMap: Record<string, string> = {
                    'boatShoes.png': '보트슈즈',
                    'boatShoes2.png': '보트슈즈2',
                    'boots.png': '부츠',
                    'boots2.png': '부츠2',
                    'boots3.png': '부츠3',
                    'boots4.png': '부츠4',
                    'derby.png': '더비',
                    'oxford.png': '옥스포드',
                    'plaintoe.png': '플레인토',
                    'wingtip.png': '윙팁',
                    'laceUp.png': '레이스업',
                    'monkStrap.png': '몽크스트랩',
                    'monkStrap2.png': '몽크스트랩2',
                    'monkStrap3.png': '몽크스트랩3',
                    'loafer.png': '로퍼',
                    'loafer2.png': '로퍼2',
                    'loafer3.png': '로퍼3',
                    'loafer4.png': '로퍼4',
                  }
                  
                  return images.map((imageName, i) => {
                    const displayName = displayNameMap[imageName] || imageName.replace('.png', '')
                    // 안정적인 key 생성 (카테고리 + 파일명 조합)
                    const uniqueKey = `${selectedMenCategory}-${imageName}-${i}`
                    return (
                      <div
                        key={uniqueKey}
                        style={{
                          border: `1px solid ${themeColors.border}`,
                          borderRadius: 8,
                          overflow: 'hidden',
                          cursor: 'pointer',
                          background: themeColors.surface,
                          transition: 'transform 0.2s, box-shadow 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'scale(1.05)'
                          e.currentTarget.style.boxShadow = isDarkMode 
                            ? '0 4px 12px rgba(0,0,0,0.5)' 
                            : '0 4px 12px rgba(0,0,0,0.15)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'scale(1)'
                          e.currentTarget.style.boxShadow = 'none'
                        }}
                        onClick={() => {
                          if (currentSketchNodeId) {
                            // URL 인코딩 적용 (특수문자 처리)
                            const encodedCategory = encodeURIComponent(selectedMenCategory)
                            const encodedImageName = encodeURIComponent(imageName)
                            const imagePath = `/sketchs/men/${encodedCategory}/${encodedImageName}`
                            // 이미지 URL 생성 (public 폴더의 이미지 사용)
                            setImageNodes(prev => {
                              const updated = new Map(prev)
                              const current = prev.get(currentSketchNodeId) || { 
                                imageUrl: null, 
                                materials: []
                              }
                              // 기존 이미지 URL 해제
                              if (current.imageUrl && current.imageUrl.startsWith('blob:')) {
                                URL.revokeObjectURL(current.imageUrl)
                              }
                              updated.set(currentSketchNodeId, { 
                                ...current, 
                                imageUrl: imagePath
                              })
                              return updated
                            })
                          }
                          setSketchModalOpen(false)
                          setCurrentSketchNodeId(null)
                        }}
                      >
                        <img
                          key={`img-${uniqueKey}`}
                          src={`/sketchs/men/${encodeURIComponent(selectedMenCategory)}/${encodeURIComponent(imageName)}`}
                          alt={displayName}
                          loading="lazy"
                          style={{
                            width: '100%',
                            height: 'auto',
                            display: 'block',
                          }}
                          onError={(e) => {
                            // 이미지 로드 실패 시 플레이스홀더 표시
                            const imagePath = `/sketchs/men/${encodeURIComponent(selectedMenCategory)}/${encodeURIComponent(imageName)}`
                            console.error('이미지 로드 실패:', {
                              imageName,
                              selectedMenCategory,
                              encodedCategory: encodeURIComponent(selectedMenCategory),
                              encodedImageName: encodeURIComponent(imageName),
                              fullPath: imagePath
                            })
                            e.currentTarget.style.display = 'none'
                            const parent = e.currentTarget.parentElement
                            if (parent) {
                              const errorDiv = document.createElement('div')
                              errorDiv.style.cssText = `padding: 40px; text-align: center; color: ${themeColors.textSecondary}`
                              errorDiv.textContent = `${displayName} (로드 실패)`
                              parent.innerHTML = ''
                              parent.appendChild(errorDiv)
                            }
                          }}
                        />
                        <div style={{
                          padding: '8px',
                          fontSize: '12px',
                          textAlign: 'center',
                          color: themeColors.text,
                          background: themeColors.surface,
                        }}>
                          {displayName}
                        </div>
                      </div>
                    )
                  })
                })()
              ) : (
                // 여성 신발 이미지들 (선택된 카테고리에 따라)
                (() => {
                  const imageCounts: Record<string, number> = {
                    boots: 3,
                    flats: 5,
                    heels: 7, // 1.png, 2.png, 3.png, 메리제인.png, 뮬.png, 슬릭백.png, 펌프스.png
                    loafers: 5,
                    sandal: 4,
                    sneakers: 1,
                  }
                  const count = imageCounts[selectedWomenCategory] || 0
                  const heelsSpecialNames = ['메리제인', '뮬', '슬릭백', '펌프스']
                  
                  return Array.from({ length: count }, (_, i) => {
                    return (
                      <div
                        key={i}
                        style={{
                          border: `1px solid ${themeColors.border}`,
                          borderRadius: 8,
                          overflow: 'hidden',
                          cursor: 'pointer',
                          background: themeColors.surface,
                          transition: 'transform 0.2s, box-shadow 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'scale(1.05)'
                          e.currentTarget.style.boxShadow = isDarkMode 
                            ? '0 4px 12px rgba(0,0,0,0.5)' 
                            : '0 4px 12px rgba(0,0,0,0.15)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'scale(1)'
                          e.currentTarget.style.boxShadow = 'none'
                        }}
                        onClick={() => {
                          if (currentSketchNodeId) {
                            const imagePath = selectedWomenCategory === 'heels' && i >= 3
                              ? `/sketchs/women/${selectedWomenCategory}/${heelsSpecialNames[i - 3]}.png`
                              : `/sketchs/women/${selectedWomenCategory}/${i + 1}.png`
                            // 이미지 URL 생성
                            setImageNodes(prev => {
                              const updated = new Map(prev)
                              const current = prev.get(currentSketchNodeId) || { 
                                imageUrl: null, 
                                materials: []
                              }
                              // 기존 이미지 URL 해제
                              if (current.imageUrl && current.imageUrl.startsWith('blob:')) {
                                URL.revokeObjectURL(current.imageUrl)
                              }
                              updated.set(currentSketchNodeId, { 
                                ...current, 
                                imageUrl: imagePath
                              })
                              return updated
                            })
                          }
                          setSketchModalOpen(false)
                          setCurrentSketchNodeId(null)
                        }}
                      >
                        <img
                          src={selectedWomenCategory === 'heels' && i >= 3
                            ? `/sketchs/women/${selectedWomenCategory}/${heelsSpecialNames[i - 3]}.png`
                            : `/sketchs/women/${selectedWomenCategory}/${i + 1}.png`}
                          alt={`${selectedWomenCategory} ${i + 1}`}
                          style={{
                            width: '100%',
                            height: 'auto',
                            display: 'block',
                          }}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                            const parent = e.currentTarget.parentElement
                            if (parent) {
                              parent.innerHTML = `<div style="padding: 40px; text-align: center; color: ${themeColors.textSecondary}">${selectedWomenCategory} ${i + 1}</div>`
                            }
                          }}
                        />
                        <div style={{
                          padding: '8px',
                          fontSize: '12px',
                          textAlign: 'center',
                          color: themeColors.text,
                          background: themeColors.surface,
                        }}>
                          {selectedWomenCategory === 'heels' && i >= 3
                            ? heelsSpecialNames[i - 3]
                            : `${selectedWomenCategory} ${i + 1}`}
                        </div>
                      </div>
                    )
                  })
                })()
              )}
            </div>
          </div>
        </>
      )}

      {/* 부자재 모달 */}
      {materialModalOpen && (
        <>
          {/* 모달 배경 (외부 클릭 시 닫기) */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1199,
              pointerEvents: 'auto',
              background: 'rgba(0, 0, 0, 0.5)',
            }}
            onClick={() => {
              setMaterialModalOpen(false)
              setCurrentMaterialNodeId(null)
            }}
          />
          <div
            style={{
              position: 'fixed',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 1200,
              pointerEvents: 'auto',
              background: themeColors.background,
              border: `1px solid ${themeColors.border}`,
              borderRadius: 12,
              padding: '24px',
              boxShadow: isDarkMode ? '0 8px 24px rgba(0,0,0,0.5)' : '0 8px 24px rgba(0,0,0,0.2)',
              minWidth: '400px',
              maxWidth: '600px',
              maxHeight: '80vh',
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ 
              marginBottom: '20px', 
              fontWeight: 'bold', 
              fontSize: '18px', 
              color: themeColors.text,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span>부자재 선택</span>
              <button
                onClick={() => {
                  setMaterialModalOpen(false)
                  setCurrentMaterialNodeId(null)
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: themeColors.text,
                  cursor: 'pointer',
                  fontSize: '24px',
                  lineHeight: 1,
                  padding: 0,
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '4px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = themeColors.buttonHover
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                ×
              </button>
            </div>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: '16px',
            }}>
              {/* button1.png */}
              <div
                style={{
                  border: `1px solid ${themeColors.border}`,
                  borderRadius: 8,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  background: themeColors.surface,
                  transition: 'transform 0.2s, box-shadow 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.05)'
                  e.currentTarget.style.boxShadow = isDarkMode 
                    ? '0 4px 12px rgba(0,0,0,0.5)' 
                    : '0 4px 12px rgba(0,0,0,0.15)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
                onClick={async () => {
                  if (currentMaterialNodeId) {
                    try {
                      // PNG 이미지의 여백 제거
                      const trimmedUrl = await trimImage('/materials/button1.png')

                      setImageNodes(prev => {
                        const updated = new Map(prev)
                        const current = prev.get(currentMaterialNodeId) || {
                          imageUrl: null,
                          materials: []
                        }
                        // 새로운 material 추가 (기본 위치는 중앙, 기본 크기는 50px)
                        const newMaterial: Material = {
                          id: `material-${Date.now()}-${Math.random()}`,
                          url: trimmedUrl,
                          position: { x: 25, y: 25 }, // 퍼센트 기준
                          size: { width: 15, height: 15 } // 퍼센트 기준 (50px에 해당)
                        }
                        updated.set(currentMaterialNodeId, {
                          ...current,
                          materials: [...current.materials, newMaterial]
                        })
                        return updated
                      })
                    } catch (error) {
                      console.error('이미지 여백 제거 실패:', error)
                      // 여백 제거 실패 시 원본 이미지 사용
                      setImageNodes(prev => {
                        const updated = new Map(prev)
                        const current = prev.get(currentMaterialNodeId) || {
                          imageUrl: null,
                          materials: []
                        }
                        const newMaterial: Material = {
                          id: `material-${Date.now()}-${Math.random()}`,
                          url: '/materials/button1.png',
                          position: { x: 25, y: 25 },
                          size: { width: 15, height: 15 } // 퍼센트 기준 (50px에 해당)
                        }
                        updated.set(currentMaterialNodeId, {
                          ...current,
                          materials: [...current.materials, newMaterial]
                        })
                        return updated
                      })
                    }
                  }
                  setMaterialModalOpen(false)
                  setCurrentMaterialNodeId(null)
                }}
              >
                <img
                  src="/materials/button1.png"
                  alt="Button 1"
                  style={{
                    width: '100%',
                    height: 'auto',
                    display: 'block',
                  }}
                />
              </div>
              
              {/* button2.png */}
              <div
                style={{
                  border: `1px solid ${themeColors.border}`,
                  borderRadius: 8,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  background: themeColors.surface,
                  transition: 'transform 0.2s, box-shadow 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.05)'
                  e.currentTarget.style.boxShadow = isDarkMode 
                    ? '0 4px 12px rgba(0,0,0,0.5)' 
                    : '0 4px 12px rgba(0,0,0,0.15)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
                onClick={async () => {
                  if (currentMaterialNodeId) {
                    try {
                      // PNG 이미지의 여백 제거
                      const trimmedUrl = await trimImage('/materials/button2.png')

                      setImageNodes(prev => {
                        const updated = new Map(prev)
                        const current = prev.get(currentMaterialNodeId) || {
                          imageUrl: null,
                          materials: []
                        }
                        // 새로운 material 추가 (기본 위치는 중앙, 기본 크기는 50px)
                        const newMaterial: Material = {
                          id: `material-${Date.now()}-${Math.random()}`,
                          url: trimmedUrl,
                          position: { x: 25, y: 25 }, // 퍼센트 기준
                          size: { width: 15, height: 15 } // 퍼센트 기준 (50px에 해당)
                        }
                        updated.set(currentMaterialNodeId, {
                          ...current,
                          materials: [...current.materials, newMaterial]
                        })
                        return updated
                      })
                    } catch (error) {
                      console.error('이미지 여백 제거 실패:', error)
                      // 여백 제거 실패 시 원본 이미지 사용
                      setImageNodes(prev => {
                        const updated = new Map(prev)
                        const current = prev.get(currentMaterialNodeId) || {
                          imageUrl: null,
                          materials: []
                        }
                        const newMaterial: Material = {
                          id: `material-${Date.now()}-${Math.random()}`,
                          url: '/materials/button2.png',
                          position: { x: 25, y: 25 },
                          size: { width: 15, height: 15 } // 퍼센트 기준 (50px에 해당)
                        }
                        updated.set(currentMaterialNodeId, {
                          ...current,
                          materials: [...current.materials, newMaterial]
                        })
                        return updated
                      })
                    }
                  }
                  setMaterialModalOpen(false)
                  setCurrentMaterialNodeId(null)
                }}
              >
                <img
                  src="/materials/button2.png"
                  alt="Button 2"
                  style={{
                    width: '100%',
                    height: 'auto',
                    display: 'block',
                  }}
                />
              </div>
              
              {/* button3.png */}
              <div
                style={{
                  border: `1px solid ${themeColors.border}`,
                  borderRadius: 8,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  background: themeColors.surface,
                  transition: 'transform 0.2s, box-shadow 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.05)'
                  e.currentTarget.style.boxShadow = isDarkMode 
                    ? '0 4px 12px rgba(0,0,0,0.5)' 
                    : '0 4px 12px rgba(0,0,0,0.15)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
                onClick={async () => {
                  if (currentMaterialNodeId) {
                    try {
                      // PNG 이미지의 여백 제거
                      const trimmedUrl = await trimImage('/materials/button3.png')

                      setImageNodes(prev => {
                        const updated = new Map(prev)
                        const current = prev.get(currentMaterialNodeId) || {
                          imageUrl: null,
                          materials: []
                        }
                        // 새로운 material 추가 (기본 위치는 중앙, 기본 크기는 50px)
                        const newMaterial: Material = {
                          id: `material-${Date.now()}-${Math.random()}`,
                          url: trimmedUrl,
                          position: { x: 25, y: 25 }, // 퍼센트 기준
                          size: { width: 15, height: 15 } // 퍼센트 기준 (50px에 해당)
                        }
                        updated.set(currentMaterialNodeId, {
                          ...current,
                          materials: [...current.materials, newMaterial]
                        })
                        return updated
                      })
                    } catch (error) {
                      console.error('이미지 여백 제거 실패:', error)
                      // 여백 제거 실패 시 원본 이미지 사용
                      setImageNodes(prev => {
                        const updated = new Map(prev)
                        const current = prev.get(currentMaterialNodeId) || {
                          imageUrl: null,
                          materials: []
                        }
                        const newMaterial: Material = {
                          id: `material-${Date.now()}-${Math.random()}`,
                          url: '/materials/button3.png',
                          position: { x: 25, y: 25 },
                          size: { width: 15, height: 15 } // 퍼센트 기준 (50px에 해당)
                        }
                        updated.set(currentMaterialNodeId, {
                          ...current,
                          materials: [...current.materials, newMaterial]
                        })
                        return updated
                      })
                    }
                  }
                  setMaterialModalOpen(false)
                  setCurrentMaterialNodeId(null)
                }}
              >
                <img
                  src="/materials/button3.png"
                  alt="Button 3"
                  style={{
                    width: '100%',
                    height: 'auto',
                    display: 'block',
                  }}
                />
              </div>
              
              {/* button4.png */}
              <div
                style={{
                  border: `1px solid ${themeColors.border}`,
                  borderRadius: 8,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  background: themeColors.surface,
                  transition: 'transform 0.2s, box-shadow 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.05)'
                  e.currentTarget.style.boxShadow = isDarkMode 
                    ? '0 4px 12px rgba(0,0,0,0.5)' 
                    : '0 4px 12px rgba(0,0,0,0.15)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
                onClick={async () => {
                  if (currentMaterialNodeId) {
                    try {
                      // PNG 이미지의 여백 제거
                      const trimmedUrl = await trimImage('/materials/button4.png')

                      setImageNodes(prev => {
                        const updated = new Map(prev)
                        const current = prev.get(currentMaterialNodeId) || {
                          imageUrl: null,
                          materials: []
                        }
                        // 새로운 material 추가 (기본 위치는 중앙, 기본 크기는 50px)
                        const newMaterial: Material = {
                          id: `material-${Date.now()}-${Math.random()}`,
                          url: trimmedUrl,
                          position: { x: 25, y: 25 }, // 퍼센트 기준
                          size: { width: 15, height: 15 } // 퍼센트 기준 (50px에 해당)
                        }
                        updated.set(currentMaterialNodeId, {
                          ...current,
                          materials: [...current.materials, newMaterial]
                        })
                        return updated
                      })
                    } catch (error) {
                      console.error('이미지 여백 제거 실패:', error)
                      // 여백 제거 실패 시 원본 이미지 사용
                      setImageNodes(prev => {
                        const updated = new Map(prev)
                        const current = prev.get(currentMaterialNodeId) || {
                          imageUrl: null,
                          materials: []
                        }
                        const newMaterial: Material = {
                          id: `material-${Date.now()}-${Math.random()}`,
                          url: '/materials/button4.png',
                          position: { x: 25, y: 25 },
                          size: { width: 15, height: 15 } // 퍼센트 기준 (50px에 해당)
                        }
                        updated.set(currentMaterialNodeId, {
                          ...current,
                          materials: [...current.materials, newMaterial]
                        })
                        return updated
                      })
                    }
                  }
                  setMaterialModalOpen(false)
                  setCurrentMaterialNodeId(null)
                }}
              >
                <img
                  src="/materials/button4.png"
                  alt="Button 4"
                  style={{
                    width: '100%',
                    height: 'auto',
                    display: 'block',
                  }}
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* 노드 생성 모달 */}
      {nodeCreationModal.show && (
        <>
          {/* 모달 배경 (외부 클릭 시 닫기) */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1199,
              pointerEvents: 'auto',
            }}
            onClick={() => {
              setNodeCreationModal({ show: false, position: { x: 0, y: 0 }, fromNodeId: null })
            }}
          />
          <div
            style={{
              position: 'fixed',
              left: nodeCreationModal.position.x,
              top: nodeCreationModal.position.y,
              transform: 'translate(-50%, -50%)',
              zIndex: 1200,
              pointerEvents: 'auto',
              background: themeColors.background,
              border: `1px solid ${themeColors.border}`,
              borderRadius: 8,
              padding: '16px',
              boxShadow: isDarkMode ? '0 4px 12px rgba(0,0,0,0.5)' : '0 4px 12px rgba(0,0,0,0.15)',
              minWidth: '200px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
          <div style={{ marginBottom: '12px', fontWeight: 'bold', fontSize: '14px', color: themeColors.text }}>
            노드 생성
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              onClick={() => {
                const targetPoint = editor.screenToPage({ 
                  x: nodeCreationModal.position.x, 
                  y: nodeCreationModal.position.y 
                })
                createNanobananaNode(targetPoint, nodeCreationModal.fromNodeId)
                setNodeCreationModal({ show: false, position: { x: 0, y: 0 }, fromNodeId: null })
              }}
              style={{
                padding: '10px 16px',
                border: `1px solid ${themeColors.border}`,
                borderRadius: 6,
                background: themeColors.buttonBg,
                color: themeColors.text,
                cursor: 'pointer',
                fontSize: '14px',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = themeColors.buttonHover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = themeColors.buttonBg
              }}
            >
              나노바나나 실행 노드
            </button>
            <button
              onClick={() => {
                const targetPoint = editor.screenToPage({ 
                  x: nodeCreationModal.position.x, 
                  y: nodeCreationModal.position.y 
                })
                // 이미지 노드 생성 (기존 함수 사용)
                const nodeWidth = 350
                const nodeHeight = 400
                const nodeX = targetPoint.x - nodeWidth / 2
                const nodeY = targetPoint.y - nodeHeight / 2

                const shapes = editor.getCurrentPageShapes()
                const existingNodes = shapes.filter((s) => s.type === 'frame')
                const spacing = 50
                let finalX = nodeX
                let finalY = nodeY
                let attempts = 0
                const maxAttempts = 100

                while (attempts < maxAttempts) {
                  let overlaps = false
                  for (const existingNode of existingNodes) {
                    const ex = existingNode.x
                    const ey = existingNode.y
                    const ew = (existingNode as any).props?.w || nodeWidth
                    const eh = (existingNode as any).props?.h || nodeHeight
                    const noOverlap = 
                      finalX + nodeWidth + spacing < ex ||
                      finalX - spacing > ex + ew ||
                      finalY + nodeHeight + spacing < ey ||
                      finalY - spacing > ey + eh
                    if (!noOverlap) {
                      overlaps = true
                      break
                    }
                  }
                  if (!overlaps) break
                  finalX += nodeWidth + spacing
                  attempts++
                }

                editor.createShape({
                  type: 'frame',
                  x: finalX,
                  y: finalY,
                  props: { 
                    w: nodeWidth, 
                    h: nodeHeight,
                    name: '이미지 노드',
                  },
                } as any)

                setTimeout(() => {
                  const allShapes = editor.getCurrentPageShapes()
                  const nodeShape = allShapes
                    .filter((s) => s.type === 'frame')
                    .find((s) => {
                      const dx = Math.abs(s.x - finalX)
                      const dy = Math.abs(s.y - finalY)
                      return dx < 10 && dy < 10
                    })
                  
                  const nodeId = nodeShape?.id || ''
                  if (nodeId) {
                    const nodeScreenPos = editor.pageToScreen({ x: finalX + nodeWidth / 2, y: finalY + nodeHeight / 2 })
                    const newNodeOverlay: NodeOverlayState = {
                      nodeId,
                      nodeX: finalX + nodeWidth / 2,
                      nodeY: finalY + nodeHeight / 2,
                      screenX: nodeScreenPos.x,
                      screenY: nodeScreenPos.y,
                    }
                    setNodeOverlays(prev => new Map(prev).set(nodeId, newNodeOverlay))
                    setImageNodes(prev => new Map(prev).set(nodeId, { 
                      imageUrl: null, 
                      materials: []
                    }))

                    // 연결 생성
                    if (nodeCreationModal.fromNodeId) {
                      const connectionId = `conn:${nodeCreationModal.fromNodeId}:${nodeId}`
                      setConnections(prev => {
                        const updated = new Map(prev)
                        updated.set(connectionId, {
                          fromNodeId: nodeCreationModal.fromNodeId!,
                          toNodeId: nodeId,
                        })
                        return updated
                      })
                      setTimeout(() => {
                        drawAllConnections()
                      }, 10)
                    }
                  }
                }, 50)

                setNodeCreationModal({ show: false, position: { x: 0, y: 0 }, fromNodeId: null })
              }}
              style={{
                padding: '10px 16px',
                border: `1px solid ${themeColors.border}`,
                borderRadius: 6,
                background: themeColors.buttonBg,
                color: themeColors.text,
                cursor: 'pointer',
                fontSize: '14px',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = themeColors.buttonHover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = themeColors.buttonBg
              }}
            >
              이미지 노드
            </button>
          </div>
        </div>
        </>
      )}
    </>
  )
}

const components = {
  Toolbar: MyToolbar,
}



function App() {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
			<Tldraw components={components} />
		</div>
  )
}

export default App
