/**
 * ThreePreview Component
 * 3D preview of the booklet using Three.js
 */

import * as THREE from 'three';
import { appState } from '../services/state';
import { SHEET_SIZES } from '../types';

export class ThreePreview {
  private container!: HTMLElement;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private booklet!: THREE.Group;
  private isAnimating = false;
  private animationId: number | null = null;

  mount(): void {
    this.container = document.getElementById('three-container')!;

    // Clear placeholder
    this.container.innerHTML = '';

    this.initScene();
    this.createBooklet();
    this.setupControls();
    this.animate();

    // Listen for project changes
    appState.onProjectChange(() => {
      this.updateBooklet();
    });
  }

  private initScene(): void {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a1a);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      45,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 5, 10);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    this.scene.add(directionalLight);

    // Ground plane
    const groundGeometry = new THREE.PlaneGeometry(20, 20);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d2d2d,
      roughness: 0.8,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  private createBooklet(): void {
    this.booklet = new THREE.Group();
    this.updateBooklet();
    this.scene.add(this.booklet);
  }

  private updateBooklet(): void {
    // Clear existing booklet
    while (this.booklet.children.length > 0) {
      const child = this.booklet.children[0];
      this.booklet.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
    }

    const project = appState.getProject();
    const signatureCount = project.signatures.length || 1;
    const pagesPerSig = project.outputOptions.pagesPerSignature;

    // Calculate booklet dimensions based on settings
    const sheetSize = SHEET_SIZES[project.outputOptions.sheetSize];
    const scale = 0.01; // Scale down for 3D view

    let pageWidth: number;
    let pageHeight: number;

    if (project.outputOptions.bookletSize.startsWith('quarter-')) {
      pageWidth = (sheetSize.width / 2) * scale;
      pageHeight = (sheetSize.height / 2) * scale;
    } else {
      pageWidth = (sheetSize.width / 2) * scale;
      pageHeight = sheetSize.height * scale;
    }

    const bookletDepth = signatureCount * (pagesPerSig / 4) * 0.02; // Approximate thickness

    // Create cover
    const coverGeometry = new THREE.BoxGeometry(pageWidth * 2 + 0.1, pageHeight + 0.1, 0.05);
    const coverMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a9eff,
      roughness: 0.5,
      metalness: 0.1,
    });
    const cover = new THREE.Mesh(coverGeometry, coverMaterial);
    cover.position.y = bookletDepth / 2 + 0.025;
    cover.castShadow = true;
    this.booklet.add(cover);

    // Create pages
    for (let i = 0; i < signatureCount; i++) {
      const pageGeometry = new THREE.BoxGeometry(
        pageWidth * 2 - 0.1,
        pageHeight - 0.1,
        0.01
      );
      const pageMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.9,
      });

      // Create multiple pages per signature
      const sheetsPerSig = pagesPerSig / 4;
      for (let j = 0; j < sheetsPerSig; j++) {
        const page = new THREE.Mesh(pageGeometry, pageMaterial);
        page.position.y = i * 0.04 + j * 0.015;
        page.castShadow = true;
        this.booklet.add(page);
      }
    }

    // Create back cover
    const backCover = new THREE.Mesh(coverGeometry, coverMaterial.clone());
    backCover.position.y = -bookletDepth / 2 - 0.025;
    backCover.castShadow = true;
    this.booklet.add(backCover);

    // Add spine
    const spineGeometry = new THREE.BoxGeometry(0.1, pageHeight + 0.1, bookletDepth + 0.1);
    const spineMaterial = new THREE.MeshStandardMaterial({
      color: 0x3a8eef,
      roughness: 0.4,
    });
    const spine = new THREE.Mesh(spineGeometry, spineMaterial);
    spine.position.x = -pageWidth - 0.05;
    spine.castShadow = true;
    this.booklet.add(spine);

    // Rotate booklet to lay flat
    this.booklet.rotation.x = -Math.PI / 2;
  }

  private setupControls(): void {
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };

    this.renderer.domElement.addEventListener('mousedown', (e: MouseEvent) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    this.renderer.domElement.addEventListener('mousemove', (e: MouseEvent) => {
      if (!isDragging) return;

      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;

      this.booklet.rotation.z += deltaX * 0.01;
      this.booklet.rotation.x += deltaY * 0.01;

      previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    this.renderer.domElement.addEventListener('mouseup', () => {
      isDragging = false;
    });

    this.renderer.domElement.addEventListener('mouseleave', () => {
      isDragging = false;
    });

    // Mouse wheel zoom
    this.renderer.domElement.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      const zoomSpeed = 0.001;
      this.camera.position.z += e.deltaY * zoomSpeed * 5;
      this.camera.position.z = Math.max(5, Math.min(20, this.camera.position.z));
    });
  }

  private animate(): void {
    this.isAnimating = true;

    const render = () => {
      if (!this.isAnimating) return;

      this.animationId = requestAnimationFrame(render);
      this.renderer.render(this.scene, this.camera);
    };

    render();
  }

  resize(): void {
    if (!this.container || !this.camera || !this.renderer) return;

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  destroy(): void {
    this.isAnimating = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }

    // Dispose of Three.js resources
    this.renderer.dispose();

    // Remove canvas
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
