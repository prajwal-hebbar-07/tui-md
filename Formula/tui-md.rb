class TuiMd < Formula
  desc "Read markdown and Mermaid diagrams in a VS Code-style terminal viewer"
  homepage "https://github.com/prajwal-hebbar-07/tui-md"
  url "https://github.com/prajwal-hebbar-07/tui-md/releases/download/v0.1.0/tui-md-viewer-0.1.0.tgz"
  sha256 "16f07daf4dc05d6d2894f8deeaa634dc51defe0c4b986dc4b19229a948350011"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec.glob("bin/*")
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/tui-md --version")
    (testpath/"note.md").write("# Hello from brew\n")
    assert_match "Hello from brew", shell_output("#{bin}/tui-md --dump #{testpath}/note.md")
  end
end
