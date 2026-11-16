; Compass Launcher: página de opciones del instalador (después de elegir carpeta)
; - Icono en el escritorio (marcado)
; - Descargar ya todas las versiones de Java (la primera vez que juegues va más rápido)
; - Abrir Compass al iniciar Windows
; En las actualizaciones automáticas (instalación silenciosa) no se pregunta ni se toca nada.
!include nsDialogs.nsh
!include LogicLib.nsh

Var CompassChkDesktop
Var CompassChkJava
Var CompassChkStartup
Var CompassOptDesktop
Var CompassOptJava
Var CompassOptStartup

!macro customPageAfterChangeDir
  Page custom CompassOptionsPage CompassOptionsLeave
!macroend

Function CompassOptionsPage
  ${If} ${Silent}
    Abort
  ${EndIf}
  ; textos según el idioma de Windows: español, catalán o inglés
  StrCpy $R0 "Choose how to install Compass Launcher:"
  StrCpy $R1 "Create a desktop icon"
  StrCpy $R2 "Download every Java version now (the first game starts faster)"
  StrCpy $R3 "Open Compass when Windows starts"
  StrCpy $R4 "You can change all of this later in Compass settings."
  ${If} $LANGUAGE == 3082
  ${OrIf} $LANGUAGE == 1034
    StrCpy $R0 "Elige cómo quieres instalar Compass Launcher:"
    StrCpy $R1 "Crear un icono en el escritorio"
    StrCpy $R2 "Descargar ya todas las versiones de Java (la primera partida empieza antes)"
    StrCpy $R3 "Abrir Compass al iniciar Windows"
    StrCpy $R4 "Todo esto se puede cambiar luego en los Ajustes de Compass."
  ${ElseIf} $LANGUAGE == 1027
    StrCpy $R0 "Tria com vols instal·lar Compass Launcher:"
    StrCpy $R1 "Crear una icona a l'escriptori"
    StrCpy $R2 "Descarregar ja totes les versions de Java (la primera partida comença abans)"
    StrCpy $R3 "Obrir Compass en iniciar Windows"
    StrCpy $R4 "Tot això es pot canviar després a la configuració de Compass."
  ${EndIf}
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 20u "$R0"
  Pop $0
  ${NSD_CreateCheckbox} 10u 28u 100% 12u "$R1"
  Pop $CompassChkDesktop
  ${NSD_Check} $CompassChkDesktop
  ${NSD_CreateCheckbox} 10u 46u 100% 12u "$R2"
  Pop $CompassChkJava
  ${NSD_CreateCheckbox} 10u 64u 100% 12u "$R3"
  Pop $CompassChkStartup
  ${NSD_CreateLabel} 0 92u 100% 20u "$R4"
  Pop $0
  nsDialogs::Show
FunctionEnd

Function CompassOptionsLeave
  ${NSD_GetState} $CompassChkDesktop $CompassOptDesktop
  ${NSD_GetState} $CompassChkJava $CompassOptJava
  ${NSD_GetState} $CompassChkStartup $CompassOptStartup
FunctionEnd

!macro customInstall
  ${IfNot} ${Silent}
    ${If} $CompassOptDesktop == ${BST_CHECKED}
      CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
    ${EndIf}
    ${If} $CompassOptJava == ${BST_CHECKED}
      CreateDirectory "$APPDATA\Compass Launcher"
      FileOpen $0 "$APPDATA\Compass Launcher\preparar-java.flag" w
      FileWrite $0 "1"
      FileClose $0
    ${EndIf}
    ${If} $CompassOptStartup == ${BST_CHECKED}
      WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Compass Launcher" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --compass-hidden'
    ${EndIf}
  ${EndIf}
!macroend

!macro customUnInstall
  ${IfNot} ${isUpdated}
    Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Compass Launcher"
  ${EndIf}
!macroend
