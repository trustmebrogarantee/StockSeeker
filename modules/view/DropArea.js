import EventEmitter from "eventemitter3";

export class DropArea extends EventEmitter {
  constructor() {
    super()
    const dropArea = document.getElementById("drop-area");
    const fileInfo = document.getElementById("file-info");
    const loadingBarContainer = document.getElementById("loading-bar");

    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
      document.body.addEventListener(eventName, (e) => e.preventDefault());
    });

    document.body.addEventListener("dragenter", () => {
      dropArea.classList.add("visible");
    });

    document.body.addEventListener("dragover", () => {
      dropArea.classList.add("dragover");
    });

    document.body.addEventListener("dragleave", (e) => {
      if (e.relatedTarget === null || !dropArea.contains(e.relatedTarget)) {
        dropArea.classList.remove("dragover", "visible");
      }
    });

    document.body.addEventListener("drop", (e) => {
      dropArea.classList.remove("dragover");
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        fileInfo.innerHTML = `File: ${file.name}<br>Size: ${(
          file.size / 1024
        ).toFixed(2)} KB<br>Type: ${file.type || "Unknown"}`;
        loadingBarContainer.classList.add("visible");
        if (file.type === 'application/json') {
          const reader = new FileReader();
          reader.onload = (e) => {
            this.emit('file-drop', e.target.result)
             setTimeout(() => {
              dropArea.classList.remove("visible");
              loadingBarContainer.classList.remove("visible");
              fileInfo.innerHTML = "";
            }, 5000);
          };
          reader.readAsText(file);
        }

      } else {
        dropArea.classList.remove("visible");
      }
    });
  }
}
