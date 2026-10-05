Attribute VB_Name = "MACRO_Correction_GPJ"
'==============================================================================
' MACRO DE MAINTENANCE — Gestion_Personnel_GPJ (V4)
' À importer : Alt+F11 > Fichier > Importer un fichier… > ce .bas
' Enregistrer ensuite le classeur au format .xlsm (classeur avec macros).
' Bouton suggéré sur 00_Dashboard assigné à : Correction_Complete_GPJ
'==============================================================================
Option Explicit

Public Const MDP_FEUILLE As String = "GPJ2026"

Sub Correction_Complete_GPJ()
    Dim wb As Workbook: Set wb = ThisWorkbook
    Dim corrigees As Long, idsUp As Long, heuresVidees As Long, feuillesProt As Long
    Dim ws As Worksheet, cel As Range, plage As Range

    Application.ScreenUpdating = False

    '--- 1) 02_Pointage : dates texte cassées + IDs en majuscules -------------
    Set ws = wb.Worksheets("02_Pointage")
    Deproteger ws
    Set plage = ws.Range("A6:A" & ws.Cells(ws.Rows.Count, "A").End(xlUp).Row + 300)
    For Each cel In plage
        If Len(cel.Value) > 0 Then
            If Not IsDate(cel.Value) And VarType(cel.Value) = vbString Then
                Dim d As Date
                d = ReparerDate(CStr(cel.Value))
                If Year(d) > 2000 Then
                    cel.Value = d: cel.NumberFormat = "dd/mm/yyyy": corrigees = corrigees + 1
                End If
            ElseIf IsDate(cel.Value) Then
                cel.NumberFormat = "dd/mm/yyyy"
            End If
        End If
    Next cel

    Dim colIds As Variant: colIds = Array("B")   ' Pointage: B ; Employes: A ; autres: variable
    Set plage = ws.Range("B6:B" & ws.Cells(ws.Rows.Count, "A").End(xlUp).Row + 300)
    For Each cel In plage
        If VarType(cel.Value) = vbString And Len(cel.Value) > 0 Then
            If cel.Value <> UCase(Trim(cel.Value)) Then
                cel.Value = UCase(Trim(cel.Value)): idsUp = idsUp + 1
            End If
        End If
    Next cel

    '--- 2) Heures fantômes 00:00 -> vides ------------------------------------
    Dim zoneH As Range, c2 As Range
    Set zoneH = Union(ws.Range("H6:I" & ws.Cells(ws.Rows.Count, "A").End(xlUp).Row + 300))
    For Each c2 In zoneH
        If IsDate(c2.Value) Then
            If Hour(c2.Value) = 0 And Minute(c2.Value) = 0 Then
                c2.ClearContents: heuresVidees = heuresVidees + 1
            Else
                c2.NumberFormat = "hh:mm"
            End If
        End If
    Next c2
    Proteger ws: feuillesProt = feuillesProt + 1

    '--- 3) 01_Employes : IDs majuscules + salaires numériques ----------------
    Set ws = wb.Worksheets("01_Employes")
    Deproteger ws
    For Each cel In ws.Range("A6:A30")
        If VarType(cel.Value) = vbString And Len(cel.Value) > 0 Then
            If cel.Value <> UCase(Trim(cel.Value)) Then cel.Value = UCase(Trim(cel.Value)): idsUp = idsUp + 1
        End If
    Next cel
    For Each cel In ws.Range("L6:L30")
        If VarType(cel.Value) = vbString And Len(Replace(cel.Value, " ", "")) > 0 Then
            cel.Value = CDbl(Replace(cel.Value, " ", "")): cel.NumberFormat = "#,##0"
        ElseIf Not IsEmpty(cel.Value) Then
            cel.NumberFormat = "#,##0"
        End If
    Next cel
    Proteger ws: feuillesProt = feuillesProt + 1

    '--- 4) Protection des autres feuilles ------------------------------------
    Dim noms As Variant, i As Long
    noms = Array("03_Paie", "04_Conges", "05_Contrats", "06_Competences", _
                 "07_Planning", "08_Sanctions", "09_Contacts", "00_Dashboard", _
                 "00_Parametres", "10_Mode_Emploi")
    For i = LBound(noms) To UBound(noms)
        Set ws = wb.Worksheets(noms(i))
        Deproteger ws
        Proteger ws
        feuillesProt = feuillesProt + 1
    Next i

    Application.ScreenUpdating = True
    MsgBox "CORRECTION TERMINÉE" & vbCrLf & vbCrLf & _
           "Dates réparées : " & corrigees & vbCrLf & _
           "IDs remis en majuscules : " & idsUp & vbCrLf & _
           "Heures fantômes 00:00 vidées : " & heuresVidees & vbCrLf & _
           "Feuilles reprotégées : " & feuillesProt & vbCrLf & vbCrLf & _
           "Mot de passe des feuilles : " & MDP_FEUILLE, vbInformation, "GPJ — Maintenance"
End Sub

'Repare « 8/262026 » -> 26/08/2026 ; gère aussi JJ/MM/AAAA classique.
Private Function ReparerDate(ByVal s As String) As Date
    On Error Resume Next
    Dim parties() As String, mois As Long, reste As String, jour As Long, annee As Long
    s = Trim$(s)
    If InStr(s, "/") = 0 Then ReparerDate = 0: Exit Function
    parties = Split(s, "/")
    mois = CLng(parties(0))
    If UBound(parties) >= 2 Then
        ReparerDate = DateSerial(CLng(parties(2)), mois, CLng(parties(1)))
        Exit Function
    End If
    reste = parties(1)
    If Len(reste) > 4 Then
        jour = CLng(Left$(reste, Len(reste) - 4))
        annee = CLng(Right$(reste, 4))
    Else
        jour = CLng(reste): annee = Year(Date)
    End If
    ReparerDate = DateSerial(annee, mois, jour)
    If Err.Number <> 0 Then Err.Clear: ReparerDate = 0
End Function

Private Sub Deproteger(ws As Worksheet)
    On Error Resume Next
    ws.Unprotect MDP_FEUILLE
    On Error GoTo 0
End Sub

Private Sub Proteger(ws As Worksheet)
    ws.Protect Password:=MDP_FEUILLE, _
        DrawingObjects:=True, Contents:=True, Scenarios:=True, _
        AllowSelectingLockedCells:=True, AllowSelectingUnlockedCells:=True, _
        AllowFormattingCells:=True, AllowFormattingColumns:=True, AllowFormattingRows:=True, _
        AllowSorting:=False, AllowUsingPivotTables:=False
End Sub
