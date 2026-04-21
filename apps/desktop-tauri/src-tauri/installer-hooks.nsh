; DraftCoach NSIS Installer Hooks
; Includes the Node.js backend bundle (sidecar + backend) into the installer
; because Tauri's resource bundler flattens directories and can't preserve
; nested node_modules structure.

; Paths are relative to the generated installer.nsi at:
;   apps/desktop-tauri/src-tauri/target/release/nsis/<arch>/installer.nsi
; So ..\..\..\..\..\build-bundle\ points to apps/desktop-tauri/build-bundle/

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Installing DraftCoach backend..."

  ; Copy sidecar (backend.js + node_modules with preserved structure)
  SetOutPath "$INSTDIR\sidecar"
  File /r "..\..\..\..\..\build-bundle\sidecar\*.*"

  ; Copy backend (main.cjs + related .cjs files + cooldowns)
  SetOutPath "$INSTDIR\backend"
  File /r "..\..\..\..\..\build-bundle\backend\*.*"

  DetailPrint "DraftCoach backend installed."

  ; Restore output path to install dir
  SetOutPath "$INSTDIR"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Clean up backend directories on uninstall
  RMDir /r "$INSTDIR\sidecar"
  RMDir /r "$INSTDIR\backend"
!macroend
