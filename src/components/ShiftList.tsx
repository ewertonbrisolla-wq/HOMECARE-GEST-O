import React, { useEffect, useState } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, orderBy, where, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Shift, MonthSummary, PatientSummary } from '../types';
import { getShiftLimit, formatCurrency, formatMonth } from '../lib/shift-logic';
import { maskPhone } from '../lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { AlertCircle, Printer, ChevronDown, ChevronRight, Edit2, Trash2, MessageCircle, User as UserIcon, Phone, Calendar, Heart, ShieldCheck, CheckCircle2, Clock, Loader2, History, ClipboardList } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { toast } from 'sonner';
import { ShiftForm } from './ShiftForm';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';

interface ShiftListProps {
  shifts: Shift[];
  isAdmin?: boolean;
}

export function ShiftList({ shifts, isAdmin: propIsAdmin }: ShiftListProps) {
  const [expandedMonths, setExpandedMonths] = useState<string[]>([]);
  const [expandedPatients, setExpandedPatients] = useState<string[]>([]);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [viewingPatient, setViewingPatient] = useState<Shift | null>(null);
  const [viewingTech, setViewingTech] = useState<{ name: string, month: string } | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [printingMonth, setPrintingMonth] = useState<string | null>(null);
  const [bulkNfs, setBulkNfs] = useState('');
  const [updatingBulk, setUpdatingBulk] = useState(false);
  const [settings, setSettings] = useState<any>({});

  const isAdmin = propIsAdmin ?? (auth.currentUser?.email === "ewerton.brisolla@gmail.com");

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'system'), (doc) => {
      if (doc.exists()) {
        setSettings(doc.data() as any);
      }
    });
    return () => unsubscribe();
  }, []);

  const calculateAge = (dob: string) => {
    if (!dob) return null;
    try {
      const birthDate = new Date(dob);
      if (isNaN(birthDate.getTime())) return null;
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      return age;
    } catch (e) {
      return null;
    }
  };

  const techShifts = viewingTech 
    ? shifts.filter(s => s.techName === viewingTech.name && s.competence === viewingTech.month) 
    : [];
  const techInfo = techShifts[0] || (viewingTech ? shifts.find(s => s.techName === viewingTech.name) : null);

  const organizedData: Record<string, MonthSummary> = shifts.reduce((acc, shift) => {
    const month = shift.competence;
    if (!acc[month]) {
      acc[month] = { competence: month, patients: {} };
    }

    if (!acc[month].patients[shift.patientName]) {
      acc[month].patients[shift.patientName] = {
        patientName: shift.patientName,
        totalShifts: 0,
        limitShifts: getShiftLimit(month),
        isOverLimit: false,
        shifts: []
      };
    }

    acc[month].patients[shift.patientName].shifts.push(shift);
    acc[month].patients[shift.patientName].totalShifts += shift.shiftCount;
    acc[month].patients[shift.patientName].isOverLimit = 
      acc[month].patients[shift.patientName].totalShifts > acc[month].patients[shift.patientName].limitShifts;

    return acc;
  }, {} as Record<string, MonthSummary>);

  const toggleMonth = (month: string) => {
    setExpandedMonths(prev => prev.includes(month) ? prev.filter(m => m !== month) : [...prev, month]);
  };

  const togglePatient = (month: string, patient: string) => {
    const key = `${month}-${patient}`;
    setExpandedPatients(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const handleBulkUpdate = async () => {
    if (!isAdmin || !viewingTech || !techShifts.length) return;
    
    setUpdatingBulk(true);
    try {
      const promises = techShifts.map(shift => {
        if (!shift.id) return Promise.resolve();
        const updateData: any = { isConfirmed: true };
        if (bulkNfs) updateData.nfsNumber = bulkNfs;
        return updateDoc(doc(db, 'shifts', shift.id), updateData);
      });
      
      await Promise.all(promises);
      toast.success('Todos os lançamentos do técnico foram confirmados e atualizados!');
      setBulkNfs('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'shifts/bulk');
      toast.error('Erro ao realizar atualização em massa.');
    } finally {
      setUpdatingBulk(false);
    }
  };

  const handlePrint = (month?: string) => {
    setPrintingMonth(month || null);
    setShowPrintPreview(true);
  };

  const triggerActualPrint = () => {
    const printContent = document.getElementById('printable-report');
    if (!printContent) return;

    // Create a temporary iframe for printing
    const iframe = document.createElement('iframe');
    iframe.setAttribute('style', 'position: absolute; width: 0; height: 0; top: 0; left: 0;');
    document.body.appendChild(iframe);
    
    const iframeDoc = iframe.contentWindow?.document;
    if (!iframeDoc) return;

    // Copy all styles from the main document to the iframe to ensure identical rendering
    const styles = document.querySelectorAll('style, link[rel="stylesheet"]');
    let headContent = '';
    styles.forEach(style => {
      headContent += style.outerHTML;
    });

    iframeDoc.open();
    iframeDoc.write(`
      <html>
        <head>
          <title>Relatório Audimed</title>
          ${headContent}
          <style>
            @media print {
              @page { size: landscape; margin: 8mm; }
              body { background: white !important; padding: 0 !important; margin: 0 !important; }
              .no-print { display: none !important; }
            }
            body { font-family: sans-serif; font-size: 11px; }
            /* Ensure the check square is visible in print */
            .check-square { 
              width: 14px !important; 
              height: 14px !important; 
              border: 1px solid #64748b !important; 
              display: inline-block !important; 
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #e2e8f0 !important; padding: 4px 6px !important; line-height: 1.2 !important; }
            h1, h2, h3 { margin: 0 !important; }
          </style>
        </head>
        <body>
          <div class="p-4">
            ${printContent.innerHTML}
          </div>
          <script>
            // Wait for all resources (images, etc) to load before printing
            window.onload = () => {
              setTimeout(() => {
                window.focus();
                window.print();
                setTimeout(() => {
                  window.frameElement.remove();
                }, 500);
              }, 800);
            };
          </script>
        </body>
      </html>
    `);
    iframeDoc.close();
  };

  const openWhatsApp = (phone: string) => {
    if (!phone) {
      toast.error('Número de WhatsApp não informado para este registro.');
      return;
    }
    const cleanPhone = phone.replace(/\D/g, '');
    window.open(`https://wa.me/${cleanPhone.startsWith('55') ? cleanPhone : '55' + cleanPhone}`, '_blank');
  };

  const handleToggleConfirm = async (shift: Shift) => {
    if (!isAdmin || !shift.id) return;

    setConfirmingId(shift.id);
    try {
      await updateDoc(doc(db, 'shifts', shift.id), {
        isConfirmed: !(!!shift.isConfirmed)
      });
      toast.success(shift.isConfirmed ? 'Confirmação removida.' : 'Lançamento confirmado com sucesso!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'shifts/' + shift.id);
      toast.error('Erro ao atualizar status.');
    } finally {
      setConfirmingId(null);
    }
  };

  const handleDeleteShift = async (shift: Shift) => {
    if (!isAdmin || !shift.id) return;
    if (!window.confirm(`Tem certeza que deseja excluir o lançamento do paciente ${shift.patientName}?`)) return;

    try {
      await deleteDoc(doc(db, 'shifts', shift.id));
      toast.success('Lançamento excluído com sucesso!');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'shifts/' + shift.id);
      toast.error('Erro ao excluir lançamento.');
    }
  };

  if (shifts.length === 0) {
    return <div className="flex justify-center p-8 text-muted-foreground">Nenhum lançamento encontrado.</div>;
  }

  if (shifts.length === 0) {
    return (
      <Card className="mt-8 border-primary/20">
        <CardContent className="p-8 text-center text-muted-foreground">
          Nenhum plantão registrado ainda.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 mt-8 no-print">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-primary">Atendimentos Organizados</h2>
      </div>

      {Object.values(organizedData).sort((a, b) => b.competence.localeCompare(a.competence)).map(monthData => (
        <Card key={monthData.competence} className="overflow-hidden border-primary/20">
          <CardHeader className="bg-primary/5 cursor-pointer" onClick={() => toggleMonth(monthData.competence)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {expandedMonths.includes(monthData.competence) ? <ChevronDown className="text-primary" /> : <ChevronRight className="text-primary" />}
                <CardTitle className="text-primary">{formatMonth(monthData.competence)}</CardTitle>
              </div>
              <div className="flex items-center gap-3">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="border-primary text-primary hover:bg-primary/10 h-8 text-xs font-bold"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePrint(monthData.competence);
                  }}
                >
                  <Printer className="mr-2 h-3.5 w-3.5" /> Imprimir Relatório
                </Button>
                <Badge variant="outline" className="border-primary text-primary">{Object.keys(monthData.patients).length} Pacientes</Badge>
              </div>
            </div>
          </CardHeader>
          
          {expandedMonths.includes(monthData.competence) && (
            <CardContent className="p-4 space-y-6 bg-muted/30">
              {Object.values(monthData.patients)
                .sort((a, b) => a.patientName.localeCompare(b.patientName))
                .map(patientData => (
                <Card key={patientData.patientName} className={`border-primary/20 shadow-sm overflow-hidden ${patientData.isOverLimit ? 'ring-2 ring-destructive/50 border-destructive/50' : ''}`}>
                  <div 
                    className={`${patientData.isOverLimit ? 'bg-destructive/10' : 'bg-primary/5'} p-3 flex items-center justify-between border-b border-primary/10 transition-colors`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`${patientData.isOverLimit ? 'bg-destructive/20' : 'bg-primary/10'} p-2 rounded-full`}>
                        <UserIcon className={`h-4 w-4 ${patientData.isOverLimit ? 'text-destructive' : 'text-primary'}`} />
                      </div>
                      <div>
                        <h3 
                          className={`font-bold hover:underline cursor-pointer ${patientData.isOverLimit ? 'text-destructive' : 'text-primary'}`}
                          onClick={() => {
                            const firstShift = patientData.shifts[0];
                            if (firstShift) setViewingPatient(firstShift);
                          }}
                        >
                          {patientData.patientName} 
                          {patientData.shifts[0]?.patientDob && (
                            <span className="ml-2 text-xs font-normal opacity-70">
                              ({calculateAge(patientData.shifts[0].patientDob)} anos)
                            </span>
                          )}
                          {patientData.shifts[0]?.healthInsurance && (
                            <span className="ml-2 text-xs font-bold opacity-70">
                              - {patientData.shifts[0].healthInsurance}
                            </span>
                          )}
                        </h3>
                        <p className="text-xs text-muted-foreground">Paciente em Atendimento</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-sm bg-background px-3 py-1 rounded-full border border-primary/10">
                        Total: <span className={patientData.isOverLimit ? "text-destructive font-bold" : "font-semibold"}>
                          {patientData.totalShifts} / {patientData.limitShifts} Plantões
                        </span>
                      </div>
                      {patientData.isOverLimit && (
                        <Badge variant="destructive" className="flex gap-1 animate-pulse">
                          <AlertCircle className="h-3 w-3" /> Limite Excedido
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="p-0 overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow className="border-primary/10">
                          <TableHead className="font-bold text-primary">Técnico(a)</TableHead>
                          <TableHead className="font-bold text-primary">Dados Bancários</TableHead>
                          {isAdmin && <TableHead className="font-bold text-primary">NFS-e</TableHead>}
                          <TableHead className="font-bold text-primary">Plantões</TableHead>
                          <TableHead className="font-bold text-primary">Alimentação</TableHead>
                          <TableHead className="font-bold text-primary">Valor Total</TableHead>
                          <TableHead className="font-bold text-primary">Status</TableHead>
                          <TableHead className="text-right font-bold text-primary">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {patientData.shifts.map(shift => (
                          <TableRow key={shift.id} className="border-primary/10 hover:bg-primary/5 transition-colors">
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <span 
                                  className="hover:text-primary hover:underline cursor-pointer font-semibold"
                                  onClick={() => setViewingTech({ name: shift.techName, month: monthData.competence })}
                                >
                                  {shift.techName}
                                </span>
                                {shift.techWhatsapp && (
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-6 w-6 text-[#25D366] hover:bg-[#25D366]/10"
                                    onClick={() => openWhatsApp(shift.techWhatsapp)}
                                    title="Falar com Técnico(a) no WhatsApp"
                                  >
                                    <MessageCircle className="h-4 w-4 fill-current" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-[11px] leading-tight">
                              <div className="flex flex-col">
                                <span className="font-bold text-primary">{shift.bankName}</span>
                                <span className="text-sm font-bold text-primary">PIX: {shift.bankPix}</span>
                                <span>Ag: {shift.bankAgency} / CC: {shift.bankAccount}</span>
                              </div>
                            </TableCell>
                            {isAdmin && <TableCell className="font-medium">{shift.nfsNumber}</TableCell>}
                            <TableCell className="font-medium">{shift.shiftCount}</TableCell>
                            <TableCell className="text-xs">
                              {shift.hasMealAllowance ? (
                                <div className="flex flex-col">
                                  <span className="font-bold text-green-600">{formatCurrency((shift.mealAllowanceValue || 0) * shift.shiftCount)}</span>
                                  <span className="text-[10px] opacity-70">({shift.shiftCount}x {formatCurrency(shift.mealAllowanceValue || 0)})</span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="font-bold text-primary">{formatCurrency(shift.totalValue)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {shift.isConfirmed ? (
                                  <Badge className="bg-green-500 hover:bg-green-600 flex gap-1 items-center px-2 py-0">
                                    <CheckCircle2 className="h-3 w-3" /> Confirmado
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-amber-500 border-amber-500 flex gap-1 items-center px-2 py-0">
                                    <Clock className="h-3 w-3" /> Pendente
                                  </Badge>
                                )}
                                {isAdmin && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-primary hover:bg-primary/10"
                                    onClick={() => handleToggleConfirm(shift)}
                                    disabled={confirmingId === shift.id}
                                    title={shift.isConfirmed ? "Remover Confirmação" : "Confirmar Lançamento"}
                                  >
                                    {confirmingId === shift.id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <ShieldCheck className="h-4 w-4" />
                                    )}
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => setViewingPatient(shift)}
                                  className="h-8 w-8 text-primary hover:bg-primary/10"
                                  title="Ver Detalhes do Paciente"
                                >
                                  <UserIcon className="h-4 w-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => setEditingShift(shift)}
                                  className="h-8 w-8 text-primary hover:bg-primary/10"
                                  title={shift.isConfirmed && !isAdmin ? "Visualizar Lançamento" : "Editar Lançamento"}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                {isAdmin && (
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => handleDeleteShift(shift)}
                                    className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                    title="Excluir Lançamento"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              ))}
            </CardContent>
          )}
        </Card>
      ))}

      {/* Patient Details Dialog */}
      <Dialog open={!!viewingPatient} onOpenChange={(open) => !open && setViewingPatient(null)}>
        <DialogContent className="sm:max-w-[90vw] lg:max-w-[80vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b border-primary/10 pb-4">
            <DialogTitle className="text-primary flex items-center gap-2 text-2xl font-bold">
              <div className="bg-primary/10 p-2 rounded-full">
                <UserIcon className="h-6 w-6" />
              </div>
              Dados do Paciente e Responsável
            </DialogTitle>
            <DialogDescription className="text-base">
              Informações cadastrais completas do paciente e contato direto do responsável.
            </DialogDescription>
          </DialogHeader>
          {viewingPatient && (
            <div className="space-y-8 py-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6 bg-primary/5 p-6 rounded-xl border border-primary/10">
                  <h4 className="font-bold text-primary flex items-center gap-2 text-lg">
                    <div className="w-1 h-6 bg-primary rounded-full" />
                    Informações do Paciente
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground uppercase font-black tracking-wider">Nome Completo</span>
                      <p className="font-bold text-xl text-foreground break-words">{viewingPatient.patientName}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground uppercase font-black tracking-wider">Convênio Médico</span>
                      <p className="font-bold text-xl text-foreground">{viewingPatient.healthInsurance}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground uppercase font-black tracking-wider">Data de Nascimento</span>
                      <p className="font-bold text-lg flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-primary" /> 
                        {viewingPatient.patientDob ? (
                          typeof viewingPatient.patientDob === 'string' 
                            ? new Date(viewingPatient.patientDob).toLocaleDateString('pt-BR')
                            : (viewingPatient.patientDob as any).toDate 
                              ? (viewingPatient.patientDob as any).toDate().toLocaleDateString('pt-BR')
                              : new Date(viewingPatient.patientDob).toLocaleDateString('pt-BR')
                        ) : 'Não informada'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground uppercase font-black tracking-wider">Gênero</span>
                      <p className="font-bold text-lg">{viewingPatient.patientGender === 'M' ? 'Masculino' : viewingPatient.patientGender === 'F' ? 'Feminino' : 'Outro'}</p>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-6 bg-secondary/50 p-6 rounded-xl border border-secondary-foreground/10">
                  <h4 className="font-bold text-secondary-foreground flex items-center gap-2 text-lg">
                    <div className="w-1 h-6 bg-secondary-foreground rounded-full" />
                    Responsável pelo Paciente
                  </h4>
                  <div className="space-y-6">
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground uppercase font-black tracking-wider">Nome do Responsável</span>
                      <p className="font-bold text-xl text-foreground break-words">{viewingPatient.patientResponsible}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground uppercase font-black tracking-wider">Telefone de Contato</span>
                      <div className="flex items-center gap-3">
                        <p className="font-bold text-2xl text-primary">
                          {viewingPatient.responsiblePhone ? maskPhone(viewingPatient.responsiblePhone) : 'Não informado'}
                        </p>
                        {viewingPatient.responsiblePhone && (
                          <Button 
                            size="sm" 
                            className="bg-[#25D366] hover:bg-[#128C7E] text-white gap-2"
                            onClick={() => openWhatsApp(viewingPatient.responsiblePhone)}
                          >
                            <MessageCircle className="h-4 w-4 fill-current" /> WhatsApp
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Technician Details Dialog */}
      <Dialog open={!!viewingTech} onOpenChange={(open) => !open && setViewingTech(null)}>
        <DialogContent className="sm:max-w-[90vw] lg:max-w-[85vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b border-primary/10 pb-4">
            <DialogTitle className="text-primary flex items-center gap-2 text-2xl font-bold">
              <div className="bg-primary/10 p-2 rounded-full">
                <ShieldCheck className="h-6 w-6" />
              </div>
              Atendimentos do Técnico(a) - {viewingTech && formatMonth(viewingTech.month)}
            </DialogTitle>
            <DialogDescription className="text-base">
              Dados do profissional e detalhamento dos pacientes atendidos na competência selecionada.
            </DialogDescription>
          </DialogHeader>
          {viewingTech && techInfo && (
            <div className="space-y-8 py-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 bg-primary/5 p-6 rounded-xl border border-primary/10 items-end">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground uppercase font-black tracking-wider">Nome do Técnico(a)</span>
                  <p className="font-bold text-xl text-primary">{techInfo.techName}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground uppercase font-black tracking-wider">Registro COREN</span>
                  <p className="font-bold text-xl">{techInfo.techCoren}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground uppercase font-black tracking-wider">WhatsApp de Contato</span>
                  <div className="flex items-center gap-3">
                    <p className="font-bold text-xl">{techInfo.techWhatsapp ? maskPhone(techInfo.techWhatsapp) : 'Não informado'}</p>
                    {techInfo.techWhatsapp && (
                      <Button 
                        size="sm" 
                        className="h-8 bg-[#25D366] hover:bg-[#128C7E] text-white p-2"
                        onClick={() => openWhatsApp(techInfo.techWhatsapp)}
                      >
                        <MessageCircle className="h-4 w-4 fill-current" />
                      </Button>
                    )}
                  </div>
                </div>
                {isAdmin && (
                  <div className="bg-background p-4 rounded-lg border border-primary/20 space-y-3">
                    <p className="text-[10px] font-black uppercase text-primary">Ações em Massa (Gestor)</p>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Input 
                          placeholder="Nº NFS-e p/ todos" 
                          value={bulkNfs}
                          onChange={(e) => setBulkNfs(e.target.value)}
                          className="h-9 text-xs"
                        />
                      </div>
                      <Button 
                        size="sm" 
                        onClick={handleBulkUpdate}
                        disabled={updatingBulk}
                        className="bg-green-600 hover:bg-green-700 text-white font-bold text-xs h-9"
                      >
                        {updatingBulk ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar Tudo'}
                      </Button>
                    </div>
                    <p className="text-[9px] text-muted-foreground italic">Isso confirmará todos os {techShifts.length} lançamentos abaixo.</p>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <h4 className="font-bold text-primary flex items-center gap-2 text-lg">
                  <div className="bg-primary/10 p-1.5 rounded-md">
                    <ClipboardList className="h-5 w-5" />
                  </div>
                  Pacientes Atendidos em {formatMonth(viewingTech.month)}
                </h4>
                <div className="border border-primary/10 rounded-xl overflow-x-auto shadow-sm">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow className="border-primary/10">
                        <TableHead className="font-bold">Competência</TableHead>
                        <TableHead className="font-bold">Paciente</TableHead>
                        {isAdmin && <TableHead className="font-bold">NFS-e</TableHead>}
                        <TableHead className="font-bold">Plantões</TableHead>
                        <TableHead className="font-bold">Valor Total</TableHead>
                        <TableHead className="font-bold">Banco</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {techShifts.map(s => (
                        <TableRow key={s.id} className="border-primary/10 hover:bg-primary/5">
                          <TableCell className="font-bold text-primary">{formatMonth(s.competence)}</TableCell>
                          <TableCell className="font-medium">{s.patientName}</TableCell>
                          {isAdmin && <TableCell>{s.nfsNumber}</TableCell>}
                          <TableCell className="font-medium">{s.shiftCount}</TableCell>
                          <TableCell className="font-bold text-primary">{formatCurrency(s.totalValue)}</TableCell>
                          <TableCell className="text-xs font-medium">
                            <Badge variant="outline" className="font-normal">{s.bankName}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingShift} onOpenChange={(open) => !open && setEditingShift(null)}>
        <DialogContent className="sm:max-w-[90vw] lg:max-w-[80vw] max-h-[95vh] overflow-y-auto p-0 border-none bg-transparent shadow-none">
          {editingShift && (
            <ShiftForm 
              editShift={editingShift} 
              onSuccess={() => setEditingShift(null)} 
              onCancel={() => setEditingShift(null)} 
              allShifts={shifts}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Print Preview Dialog */}
      <Dialog open={showPrintPreview} onOpenChange={setShowPrintPreview}>
        <DialogContent className="sm:max-w-[95vw] max-h-[95vh] overflow-y-auto">
          <DialogHeader className="no-print">
            <div className="flex justify-between items-center">
              <div>
                <DialogTitle>Visualização de Impressão</DialogTitle>
                <DialogDescription>
                  Verifique os dados antes de imprimir. O relatório será impresso em formato paisagem.
                </DialogDescription>
              </div>
              <Button onClick={triggerActualPrint} className="bg-primary hover:bg-primary/90">
                <Printer className="mr-2 h-4 w-4" /> Confirmar e Imprimir
              </Button>
            </div>
          </DialogHeader>

          <div className="bg-white p-4 text-black rounded-lg border shadow-inner overflow-auto">
            <div id="printable-report" className="print-view-content">
              <div className="flex justify-between items-center mb-6 border-b-2 border-primary pb-4">
                <div className="flex items-center gap-4">
                  {settings.logoUrl ? (
                    <img src={settings.logoUrl} alt="Logo" className="h-12 w-auto object-contain" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="bg-primary p-2 rounded-lg">
                      <ClipboardList className="h-6 w-6 text-primary-foreground" />
                    </div>
                  )}
                  <div className="text-left">
                    <h1 className="text-2xl font-black tracking-tighter text-primary leading-none">
                      AUDIMED SAÚDE
                    </h1>
                    <p className="text-[10px] font-bold text-muted-foreground tracking-widest">
                      HOMECARE - GESTÃO
                    </p>
                  </div>
                </div>

                {printingMonth && (
                  <h2 className="text-lg font-bold text-primary mx-4">
                    {formatMonth(printingMonth).toUpperCase()}
                  </h2>
                )}

                <h2 className="text-lg font-bold text-gray-600">Relatório de Atendimentos e Pagamentos</h2>
              </div>

              {Object.values(organizedData)
                .filter(m => !printingMonth || m.competence === printingMonth)
                .sort((a, b) => b.competence.localeCompare(a.competence))
                .map(monthData => (
                <div key={monthData.competence} className="mb-6">
                  <h2 className="text-lg font-bold mb-2 bg-gray-100 p-1.5 rounded">{formatMonth(monthData.competence)}</h2>
                  {Object.values(monthData.patients)
                    .sort((a, b) => a.patientName.localeCompare(b.patientName))
                    .map(patientData => (
                      <div key={patientData.patientName} className="mb-3 border rounded-lg p-2">
                        <div className="flex justify-between items-center border-b mb-1.5 pb-0.5">
                          <h3 className="font-bold">
                            Paciente: {patientData.patientName}
                            {patientData.shifts[0]?.patientDob && (
                              <span className="ml-2 font-normal text-gray-600">
                                ({calculateAge(patientData.shifts[0].patientDob)} anos)
                              </span>
                            )}
                            {patientData.shifts[0]?.healthInsurance && (
                              <span className="ml-2 font-bold text-primary">
                                - {patientData.shifts[0].healthInsurance}
                              </span>
                            )}
                          </h3>
                          <span className="text-xs font-medium">
                            Total: {patientData.totalShifts} {patientData.isOverLimit ? '(LIMITE EXCEDIDO)' : ''}
                          </span>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-gray-50">
                              <TableHead className="h-8 text-xs">Técnico(a)</TableHead>
                              <TableHead className="h-8 text-xs">Dados Bancários</TableHead>
                              {isAdmin && <TableHead className="h-8 text-xs">NFS-e</TableHead>}
                              <TableHead className="h-8 text-xs">Plantões</TableHead>
                              <TableHead className="h-8 text-xs">Alimentação</TableHead>
                              <TableHead className="h-8 text-xs">Valor Total</TableHead>
                              <TableHead className="h-8 text-xs text-center w-10">Pago</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {patientData.shifts.map(shift => (
                              <TableRow key={shift.id} className="h-8">
                                <TableCell className="py-1 text-xs">{shift.techName}</TableCell>
                                <TableCell className="py-1 text-[10px] leading-tight">
                                  <strong>{shift.bankName}</strong> | <span className="text-xs font-bold text-primary">PIX: {shift.bankPix}</span> | Ag: {shift.bankAgency} | CC: {shift.bankAccount}
                                </TableCell>
                                {isAdmin && <TableCell className="py-1 text-xs">{shift.nfsNumber}</TableCell>}
                                <TableCell className="py-1 text-xs">{shift.shiftCount}</TableCell>
                                <TableCell className="py-1 text-[10px]">
                                  {shift.hasMealAllowance ? formatCurrency((shift.mealAllowanceValue || 0) * shift.shiftCount) : '-'}
                                </TableCell>
                                <TableCell className="py-1 text-xs font-bold">{formatCurrency(shift.totalValue)}</TableCell>
                                <TableCell className="py-1 text-center">
                                  <div className="check-square mx-auto border border-slate-400 w-4 h-4"></div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ))}
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}

