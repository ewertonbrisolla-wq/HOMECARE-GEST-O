import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Shift, UserProfile, Patient } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc, deleteDoc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from './ui/dialog';
import { toast } from 'sonner';
import { getShiftLimit, formatCurrency, formatMonth } from '../lib/shift-logic';
import { maskPhone, maskCpfCnpj } from '../lib/utils';
import { Loader2, Save, X, Trash2, AlertTriangle, HelpCircle } from 'lucide-react';
import { motion } from 'motion/react';
import Markdown from 'react-markdown';

interface ShiftFormProps {
  editShift?: Shift | null;
  userProfile?: UserProfile | null;
  onSuccess?: () => void;
  onCancel?: () => void;
  allShifts?: Shift[]; // Added to allow validation
  isAdmin?: boolean;
}

export function ShiftForm({ editShift, userProfile, onSuccess, onCancel, allShifts = [], isAdmin: propIsAdmin }: ShiftFormProps) {
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [patientsList, setPatientsList] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [settings, setSettings] = useState<any>({});

  const isAdmin = propIsAdmin ?? (auth.currentUser?.email === "ewerton.brisolla@gmail.com");

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'general'), (doc) => {
      if (doc.exists()) setSettings(doc.data());
    });
    return () => unsubscribe();
  }, []);

  const { register, handleSubmit, reset, setValue, watch, getValues, formState: { errors } } = useForm<Partial<Shift>>({
    defaultValues: {
      patientName: '',
      patientGender: 'M',
      shiftCount: 0,
      shiftValue: 0,
      competence: new Date().toISOString().slice(0, 7),
      techName: userProfile?.techName || '',
      techCoren: userProfile?.techCoren || '',
      techWhatsapp: userProfile?.techWhatsapp || '',
      pixKeyType: 'CPF/CNPJ',
      bankName: '',
      bankPix: '',
      bankAgency: '',
      bankAccount: ''
    }
  });
  const watchedPatientName = watch('patientName');
  const watchedTechName = watch('techName');
  const watchedPixKeyType = watch('pixKeyType');

  // Get unique patients and techs for the datalist
  const uniquePatientNames = Array.from(new Set(allShifts.map(s => s.patientName))).sort();
  const uniqueTechNames = Array.from(new Set(allShifts.map(s => s.techName))).sort();

  useEffect(() => {
    const q = query(collection(db, 'patients'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Patient));
      // Deduplicate by ID to prevent React key errors
      const uniqueData = data.filter((p, index, self) =>
        index === self.findIndex((s) => s.id === p.id)
      );
      setPatientsList(uniqueData);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (watchedPatientName && patientsList.length > 0) {
      const patient = patientsList.find(p => p.name === watchedPatientName);
      if (patient) {
        setSelectedPatient(patient);
        setValue('healthInsurance', patient.healthInsurance);
        setValue('patientDob', patient.dob);
        setValue('patientGender', patient.gender);
        setValue('patientResponsible', patient.responsibleName);
        setValue('responsiblePhone', patient.responsiblePhone);
        setValue('hasMealAllowance', patient.hasMealAllowance);
        setValue('mealAllowanceValue', patient.mealAllowanceValue);
      } else {
        setSelectedPatient(null);
      }
    }
  }, [watchedPatientName, patientsList, setValue]);

  useEffect(() => {
    if (!editShift && watchedTechName) {
      // Find the most recent record for this tech to get the latest data
      const existingTech = allShifts
        .filter(s => s.techName.toLowerCase() === watchedTechName.toLowerCase())
        .sort((a, b) => {
          const dateA = a.createdAt?.seconds || 0;
          const dateB = b.createdAt?.seconds || 0;
          return dateB - dateA;
        })[0];
      
      if (existingTech) {
        setValue('techCoren', existingTech.techCoren);
        setValue('techWhatsapp', existingTech.techWhatsapp);
        
        // Also try to fill bank data if available
        if (existingTech.bankName) setValue('bankName', existingTech.bankName);
        if (existingTech.bankPix) setValue('bankPix', existingTech.bankPix);
        if (existingTech.bankAgency) setValue('bankAgency', existingTech.bankAgency);
        if (existingTech.bankAccount) setValue('bankAccount', existingTech.bankAccount);
        if (existingTech.shiftValue) setValue('shiftValue', existingTech.shiftValue);
      }
    }
  }, [watchedTechName, editShift, allShifts, setValue]);

  useEffect(() => {
    if (editShift) {
      reset({
        ...editShift,
        // Ensure competence is in YYYY-MM format for the input
        competence: editShift.competence
      });
    } else if (userProfile) {
      // Auto-fill tech data for new shifts
      setValue('techName', userProfile.techName || '');
      setValue('techCoren', userProfile.techCoren || '');
      setValue('techWhatsapp', userProfile.techWhatsapp || '');
    }
  }, [editShift, userProfile, reset, setValue]);

  const onSubmit = async (data: Partial<Shift>) => {
    if (!auth.currentUser) {
      toast.error('Você precisa estar logado para salvar dados.');
      return;
    }

    setLoading(true);
    try {
      if (editShift?.id && !isAdmin && editShift.isConfirmed) {
        toast.error('Impossível Modificar, lançamento confirmado pela gestão');
        setLoading(false);
        return;
      }

      // Validation: Check for duplicate entry (same patient, same month, same user)
      if (!editShift && data.patientName && data.competence) {
        const isDuplicate = allShifts.some(s => 
          s.patientName === data.patientName && 
          s.competence === data.competence &&
          s.createdBy === auth.currentUser.uid
        );

        if (isDuplicate) {
          toast.error(`Você já realizou um lançamento para ${data.patientName} na competência ${data.competence}. Edite o lançamento existente se precisar alterar algo.`);
          setLoading(false);
          return;
        }
      }

      const mealAllowanceTotal = data.hasMealAllowance ? (data.shiftCount || 0) * (data.mealAllowanceValue || 0) : 0;
      const totalValue = ((data.shiftCount || 0) * (data.shiftValue || 0)) + mealAllowanceTotal;

      // Validation: Check if total shifts for patient in this month exceed limit
      if (data.patientName && data.competence && data.shiftCount) {
        const limit = getShiftLimit(data.competence);
        const existingShifts = allShifts.filter(s => 
          s.patientName === data.patientName && 
          s.competence === data.competence &&
          s.id !== editShift?.id
        );
        const currentTotal = existingShifts.reduce((sum, s) => sum + s.shiftCount, 0);
        const newTotal = currentTotal + data.shiftCount;

        if (newTotal > limit) {
          toast.warning(`Atenção: O limite de plantões para este paciente (${limit}) foi ultrapassado.`);
        }
      }

      const shiftData: any = {
        ...data,
        totalValue,
        isConfirmed: editShift ? (!!editShift.isConfirmed) : false,
        createdBy: editShift ? editShift.createdBy : auth.currentUser.uid,
        createdAt: editShift ? editShift.createdAt : serverTimestamp(),
      };

      // Ensure id is not saved in the document data
      delete shiftData.id;

      // Remove undefined fields to prevent Firestore errors
      Object.keys(shiftData).forEach(key => {
        if (shiftData[key] === undefined) {
          delete shiftData[key];
        }
      });

      if (editShift?.id) {
        await updateDoc(doc(db, 'shifts', editShift.id), shiftData);
        toast.success('Plantão atualizado com sucesso!');
      } else {
        await addDoc(collection(db, 'shifts'), shiftData);
        toast.success('Plantão registrado com sucesso!');
      }
      
      // If we are editing, we just close the dialog via onSuccess
      if (editShift && onSuccess) {
        onSuccess();
        return;
      }

      // For new entries, reset the form but keep tech and bank info for convenience
      const vals = getValues();
      reset({
        patientName: '',
        patientGender: 'M',
        shiftCount: 0,
        shiftValue: 0,
        competence: vals.competence || new Date().toISOString().slice(0, 7),
        techName: vals.techName || '',
        techCoren: vals.techCoren || '',
        techWhatsapp: vals.techWhatsapp || '',
        bankName: vals.bankName || '',
        pixKeyType: vals.pixKeyType || 'CPF/CNPJ',
        bankPix: vals.bankPix || '',
        bankAgency: vals.bankAgency || '',
        bankAccount: vals.bankAccount || '',
        healthInsurance: '',
        patientDob: '',
        patientResponsible: '',
        responsiblePhone: '',
        hasMealAllowance: false,
        mealAllowanceValue: 0
      });
      
      setSelectedPatient(null);

      if (onSuccess) {
        onSuccess();
      }

      // Hard reload the page after a short delay to ensure the user sees the success message
      // and the page is completely fresh for the next entry as requested.
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      handleFirestoreError(error, editShift ? OperationType.UPDATE : OperationType.CREATE, 'shifts');
      toast.error('Erro ao salvar plantão.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!editShift?.id) return;
    
    // Only admin can delete
    if (!isAdmin) {
      toast.error('Apenas o gestor proprietário pode excluir lançamentos.');
      return;
    }

    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'shifts', editShift.id));
      toast.success('Lançamento excluído com sucesso!');
      if (onSuccess) onSuccess();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'shifts');
      toast.error('Erro ao excluir lançamento.');
    } finally {
      setDeleting(false);
    }
  };

  const shiftCount = watch('shiftCount') || 0;
  const shiftValue = watch('shiftValue') || 0;
  const hasMealAllowance = watch('hasMealAllowance');
  const mealAllowanceValue = watch('mealAllowanceValue') || 0;
  const mealTotal = hasMealAllowance ? (shiftCount * mealAllowanceValue) : 0;
  const totalValue = (shiftCount * shiftValue) + mealTotal;

  return (
    <Card className="w-full max-w-4xl mx-auto border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            {editShift ? 'Editar Lançamento' : 'Novo Lançamento de Plantão'}
            <Dialog>
              <DialogTrigger render={
                <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80 flex items-center gap-1 h-7 px-2">
                  <HelpCircle className="h-4 w-4" />
                  <span className="text-xs font-bold">DÚVIDAS?</span>
                </Button>
              } />
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <HelpCircle className="h-5 w-5 text-primary" />
                    Manual de Utilização
                  </DialogTitle>
                  <DialogDescription>
                    Siga o passo a passo abaixo para realizar seus lançamentos corretamente.
                  </DialogDescription>
                </DialogHeader>
                <div className="markdown-body mt-4 prose prose-sm max-w-none">
                  <Markdown>
                    {settings.helpText || `### Como realizar um lançamento:
1. **Selecione o Paciente**: Escolha um paciente da lista cadastrada.
2. **Dados do Técnico(a)**: Verifique se seu nome, COREN e WhatsApp estão corretos.
3. **Serviço**: Informe o mês de competência, a quantidade de plantões de 12h realizados e o valor unitário acordado.
4. **Dados Bancários**: Informe seu banco e sua chave PIX para recebimento.
5. **Salvar**: Clique em "Salvar Lançamento" para registrar.

*Dica: Você pode editar lançamentos recentes clicando neles na lista abaixo, desde que ainda não tenham sido confirmados pela gestão.*`}
                  </Markdown>
                </div>
              </DialogContent>
            </Dialog>
          </CardTitle>
          <CardDescription>
            {editShift?.isConfirmed && !isAdmin 
              ? 'Este lançamento já foi confirmado pelo gestor e não pode ser editado.' 
              : 'Preencha todos os campos obrigatórios para registrar o atendimento.'}
          </CardDescription>
        </div>
        {onCancel && (
          <Button variant="ghost" size="icon" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {watchedPatientName && shiftCount > 0 && shiftValue > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-primary/10 p-4 rounded-lg flex flex-col gap-1 mb-6 border border-primary/20"
            >
              <div className="flex justify-between items-center">
                <span className="text-primary font-medium">Total Estimado:</span>
                <span className="text-2xl font-bold text-primary">{formatCurrency(totalValue)}</span>
              </div>
              {hasMealAllowance && mealTotal > 0 && (
                <div className="flex justify-between items-center text-xs text-green-600 font-medium border-t border-primary/10 pt-1 mt-1">
                  <span>Incluindo R$ de Alimentação:</span>
                  <span>{formatCurrency(mealTotal)}</span>
                </div>
              )}
            </motion.div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Dados do Paciente */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold border-b border-primary/20 pb-2 text-primary">Dados do Paciente</h3>
              
              <div className="space-y-2">
                <Label htmlFor="patientName">Selecione o Paciente</Label>
                <Select 
                  onValueChange={(v) => setValue('patientName', v)} 
                  value={watch('patientName') || ''} 
                  disabled={editShift?.isConfirmed && !isAdmin}
                >
                  <SelectTrigger className="h-12 border-primary/30">
                    <SelectValue placeholder="Selecione um paciente cadastrado" />
                  </SelectTrigger>
                  <SelectContent>
                    {patientsList.map(p => (
                      <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {patientsList.length === 0 && (
                  <p className="text-xs text-amber-600 font-medium">Nenhum paciente cadastrado pelo gestor.</p>
                )}
              </div>

              {selectedPatient && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="bg-primary/5 p-4 rounded-lg border border-primary/10 space-y-2"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase font-bold">Paciente Selecionado</p>
                      <p className="font-bold text-lg text-primary">{selectedPatient.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground uppercase font-bold">Convênio</p>
                      <p className="font-bold text-primary">{selectedPatient.healthInsurance}</p>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Hidden fields to keep the form data consistent */}
              <input type="hidden" {...register('healthInsurance')} />
              <input type="hidden" {...register('patientDob')} />
              <input type="hidden" {...register('patientGender')} />
              <input type="hidden" {...register('patientResponsible')} />
              <input type="hidden" {...register('responsiblePhone')} />
              <input type="hidden" {...register('hasMealAllowance')} />
              <input type="hidden" {...register('mealAllowanceValue')} />
            </div>

            {/* Dados do Técnico(a) e Serviço */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold border-b border-primary/20 pb-2 text-primary">Dados do Técnico(a) e Serviço</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label htmlFor="techName">Técnico (a) de Enfermagem</Label>
                  <Input 
                    id="techName" 
                    list="tech-names"
                    {...register('techName', { required: true })} 
                    placeholder="Seu nome completo" 
                    disabled={editShift?.isConfirmed && !isAdmin} 
                    autoComplete="off"
                  />
                  <datalist id="tech-names">
                    {uniqueTechNames.map(name => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="techWhatsapp">WhatsApp do Técnico(a)</Label>
                  <Input 
                    id="techWhatsapp" 
                    {...register('techWhatsapp', { required: true })} 
                    placeholder="(00)00000-0000" 
                    disabled={editShift?.isConfirmed && !isAdmin} 
                    onChange={(e) => {
                      const masked = maskPhone(e.target.value);
                      setValue('techWhatsapp', masked);
                    }}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="techCoren">COREN</Label>
                <Input id="techCoren" {...register('techCoren', { required: true })} placeholder="Número do COREN" disabled={editShift?.isConfirmed && !isAdmin} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(isAdmin && !!editShift) && (
                  <div className="space-y-2">
                    <Label htmlFor="nfsNumber">Número da NFS-e</Label>
                    <Input id="nfsNumber" {...register('nfsNumber', { required: isAdmin })} placeholder="0000" />
                  </div>
                )}
                <div className={`space-y-2 ${!(isAdmin && !!editShift) ? 'col-span-2' : ''}`}>
                  <Label htmlFor="competence">Competência</Label>
                  <Input id="competence" type="month" {...register('competence', { required: true })} disabled={editShift?.isConfirmed && !isAdmin} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label htmlFor="shiftCount">Qtd. Plantões (12h)</Label>
                  <Input id="shiftCount" type="number" {...register('shiftCount', { required: true, min: 0, valueAsNumber: true })} disabled={editShift?.isConfirmed && !isAdmin} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shiftValue">Valor do Plantão (R$)</Label>
                  <Input id="shiftValue" type="number" step="0.01" {...register('shiftValue', { required: true, min: 0, valueAsNumber: true })} disabled={editShift?.isConfirmed && !isAdmin} />
                </div>
              </div>
            </div>
          </div>

          {/* Dados Bancários */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold border-b border-primary/20 pb-2 text-primary">Dados Bancários</h3>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bankName">Nome do Banco</Label>
                <Input id="bankName" {...register('bankName', { required: true })} placeholder="Ex: Nubank, Itaú" disabled={editShift?.isConfirmed && !isAdmin} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pixKeyType">Tipo de Chave</Label>
                <Select 
                  onValueChange={(v) => {
                    setValue('pixKeyType', v as any);
                    setValue('bankPix', ''); // Clear when type changes
                  }} 
                  value={watchedPixKeyType || 'CPF/CNPJ'}
                  disabled={editShift?.isConfirmed && !isAdmin}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CPF/CNPJ">CPF/CNPJ</SelectItem>
                    <SelectItem value="Telefone">Telefone</SelectItem>
                    <SelectItem value="E-mail">E-mail</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-1">
                <Label htmlFor="bankPix">Chave PIX</Label>
                <Input 
                  id="bankPix" 
                  {...register('bankPix', { required: true })} 
                  placeholder={watchedPixKeyType === 'Telefone' ? '(00)00000-0000' : watchedPixKeyType === 'CPF/CNPJ' ? '000.000.000-00' : 'seu@email.com'} 
                  disabled={editShift?.isConfirmed && !isAdmin} 
                  onChange={(e) => {
                    const value = e.target.value;
                    if (watchedPixKeyType === 'Telefone') {
                      e.target.value = maskPhone(value);
                    } else if (watchedPixKeyType === 'CPF/CNPJ') {
                      e.target.value = maskCpfCnpj(value);
                    }
                    setValue('bankPix', e.target.value);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bankAgency">Agência</Label>
                <Input id="bankAgency" {...register('bankAgency', { required: true })} placeholder="0000" disabled={editShift?.isConfirmed && !isAdmin} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bankAccount">Conta</Label>
                <Input id="bankAccount" {...register('bankAccount', { required: true })} placeholder="00000-0" disabled={editShift?.isConfirmed && !isAdmin} />
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4">
            {editShift && isAdmin && (
              <Button 
                type="button" 
                variant="destructive" 
                className="flex-1" 
                onClick={handleDelete}
                disabled={deleting || loading}
              >
                {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Excluir Lançamento
              </Button>
            )}
            {onCancel && (
              <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={loading || deleting}>
                Cancelar
              </Button>
            )}
            {(!editShift || isAdmin || !editShift.isConfirmed) && (
              <Button type="submit" className="flex-1" disabled={loading || deleting}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {editShift ? 'Atualizar Lançamento' : 'Salvar Lançamento'}
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
