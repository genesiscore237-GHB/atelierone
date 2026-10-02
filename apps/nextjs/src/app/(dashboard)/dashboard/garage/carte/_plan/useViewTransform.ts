"use client";

import { useRef, useState, useEffect, useCallback } from "react";

export interface ViewTransform {
  k: number;
  x: number;
  y: number;
}

export interface UseViewTransformOptions {
  minZoom?: number;
  maxZoom?: number;
  width?: number;
  height?: number;
  onTransformChange?: (transform: ViewTransform) => void;
}

export function useViewTransform({
  minZoom = 0.3,
  maxZoom = 8,
  onTransformChange,
}: UseViewTransformOptions = {}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const [transform, setTransform] = useState<ViewTransform>({ k: 1, x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });

  // Apply transform to <g> element
  useEffect(() => {
    if (gRef.current) {
      gRef.current.setAttribute(
        "transform",
        `translate(${transform.x},${transform.y}) scale(${transform.k})`
      );
    }
  }, [transform]);

  // Wheel zoom
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Zoom factor
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newK = Math.max(0.3, Math.min(8, transform.k * delta));

      // Zoom toward mouse position
      const newX = mouseX - (mouseX - transform.x) * (newK / transform.k);
      const newY = mouseY - (mouseY - transform.y) * (newK / transform.k);

      const newTransform = { k: newK, x: newX, y: newY };
      setTransform(newTransform);
    };

    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [transform]);

  // Pan with middle mouse or Shift+left click
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
        e.preventDefault();
        isPanningRef.current = true;
        lastMouseRef.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isPanningRef.current) return;
      const dx = e.clientX - lastMouseRef.current.x;
      const dy = e.clientY - lastMouseRef.current.y;
      setTransform(prev => ({
        ...prev,
        x: prev.x + dx,
        y: prev.y + dy,
      }));
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
      isPanningRef.current = false;
    };

    svg.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      svg.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  // Fit to view
  const fitToView = useCallback((bounds: { x: number; y: number; w: number; h: number }, padding = 20) => {
    if (!svgRef.current) return;
    
    const svg = svgRef.current;
    const width = svg.clientWidth;
    const height = svg.clientHeight;
    
    const scale = Math.min(
      (width - padding * 2) / bounds.w,
      (height - padding * 2) / bounds.h
    );
    const clampedScale = Math.max(0.3, Math.min(8, scale));
    
    const x = width / 2 - (bounds.x + bounds.w / 2) * clampedScale;
    const y = height / 2 - (bounds.y + bounds.h / 2) * clampedScale;
    
    const newTransform = { k: clampedScale, x, y };
    setTransform(newTransform);
  }, []);

  // Reset to initial
  const reset = useCallback(() => {
    setTransform({ k: 1, x: 0, y: 0 });
  }, []);

  return {
    svgRef,
    gRef,
    transform,
    fitToView,
    reset,
    setTransform,
  };
}