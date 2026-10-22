import mermaid from 'mermaid'

let mermaidReady = false

export function ensureMermaid() {
  if (mermaidReady) return
  mermaidReady = true
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'antiscript',
    theme: 'base',
    look: 'classic',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    flowchart: { curve: 'basis', htmlLabels: true, padding: 14 },
    themeVariables: {
      darkMode: true,
      background: 'transparent',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: '15px',
      primaryColor: '#1e1e1e',
      primaryTextColor: '#d4d4d4',
      primaryBorderColor: '#9a9a9a',
      secondaryColor: '#1e1e1e',
      secondaryTextColor: '#d4d4d4',
      secondaryBorderColor: '#9a9a9a',
      tertiaryColor: '#252526',
      tertiaryTextColor: '#d4d4d4',
      tertiaryBorderColor: '#9a9a9a',
      lineColor: '#b5b5b5',
      textColor: '#d4d4d4',
      mainBkg: '#1e1e1e',
      nodeBorder: '#9a9a9a',
      clusterBkg: '#252526',
      clusterBorder: '#9a9a9a',
      titleColor: '#e7e7e7',
      edgeLabelBackground: '#1e1e1e',
      nodeTextColor: '#d4d4d4',
    },
  })
}
