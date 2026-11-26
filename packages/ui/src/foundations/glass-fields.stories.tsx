import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  EuroIcon,
  LandmarkIcon,
  PiggyBankIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  ZapIcon,
} from 'lucide-react'
import { useState } from 'react'

import { Checkbox } from '../components/checkbox'
import { DateField } from '../components/date-field'
import { Field, FieldError, FieldLabel } from '../components/field'
import { FilterControl, FilterToggle } from '../components/filter-controls'
import { Input } from '../components/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '../components/input-group'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../components/input-otp'
import { Label } from '../components/label'
import { NativeSelect, NativeSelectOption } from '../components/native-select'
import { PasswordInput } from '../components/password-input'
import { RadioGroup, RadioGroupItem } from '../components/radio-group'
import { SearchField } from '../components/search-field'
import { Slider } from '../components/slider'
import { Switch } from '../components/switch'
import { Textarea } from '../components/textarea'

/**
 * The fields in glass (#507, the owner's « B · Creusé »): a faint hollow with
 * no border (`glass-field`), the card's colour with a primary edge and a soft
 * glow on focus (`glass-field-focus`), the same in red when invalid, beside
 * an icon (`glass-field-invalid`). Shared as `fieldSurface` /
 * `fieldGroupSurface` with the pickers of `apps/web`. One phone on the page
 * (the Opérations toolbar) and in a sheet (a form); switch light / dark in
 * the toolbar.
 */
const meta: Meta = {
  title: 'Foundations/Champs en verre',
  parameters: { layout: 'fullscreen' },
  tags: ['!autodocs'],
}

export default meta

type Story = StoryObj

function Toolbar() {
  const [text, setText] = useState('')
  return (
    <div className="space-y-3 px-4 pt-4 pb-5">
      <InputGroup className="h-[44px]">
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          type="search"
          aria-label="Rechercher une opération"
          placeholder="Rechercher un libellé…"
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="text-[16px]"
        />
        <InputGroupAddon align="inline-end">
          <button
            type="button"
            className="bg-glass-fill -mr-1 flex h-[36px] items-center gap-1.5 rounded-full px-3 text-[15px] font-medium"
          >
            <SlidersHorizontalIcon aria-hidden className="size-[18px]" />
            Filtres
          </button>
        </InputGroupAddon>
      </InputGroup>
      <FilterControl
        label="Compte"
        icon={<LandmarkIcon />}
        value={{
          label: 'Livret A',
          color: '#16a34a',
          icon: <PiggyBankIcon className="text-[#16a34a]" />,
        }}
        onClear={() => {}}
        onOpen={() => {}}
        className="w-full"
      />
      <div className="grid grid-cols-2 gap-2">
        <FilterControl
          label="Catégorie"
          icon={<LandmarkIcon />}
          onClear={() => {}}
          onOpen={() => {}}
          className="w-full"
        />
        <FilterToggle
          label="Exceptionnelles"
          icon={<ZapIcon />}
          pressed
          onPressedChange={() => {}}
          className="w-full"
        />
      </div>
    </div>
  )
}

function Form() {
  const [date, setDate] = useState('2026-11-26')
  const [search, setSearch] = useState('Boul')
  return (
    <div className="glass-panel rounded-t-sheet space-y-4 px-4 pt-4 pb-6">
      <div className="text-[18px] font-semibold">Nouvelle opération</div>
      <Field>
        <FieldLabel htmlFor="gf-label">Libellé (focus)</FieldLabel>
        <Input id="gf-label" defaultValue="Boulangerie test" autoFocus />
      </Field>
      <Field data-invalid>
        <FieldLabel htmlFor="gf-amount">Montant (invalide)</FieldLabel>
        <InputGroup>
          <InputGroupInput
            id="gf-amount"
            inputMode="decimal"
            placeholder="0,00"
            aria-invalid
          />
          <InputGroupAddon align="inline-end">
            <EuroIcon />
          </InputGroupAddon>
        </InputGroup>
        <FieldError>Montant requis</FieldError>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel>Date</FieldLabel>
          <DateField value={date} onChange={setDate} title="Date" />
        </Field>
        <Field>
          <FieldLabel htmlFor="gf-kind">Type</FieldLabel>
          <NativeSelect id="gf-kind" className="w-full">
            <NativeSelectOption>Dépense</NativeSelectOption>
            <NativeSelectOption>Revenu</NativeSelectOption>
          </NativeSelect>
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="gf-account">Compte (désactivé)</FieldLabel>
        <Input id="gf-account" defaultValue="Compte courant" disabled />
      </Field>
      <SearchField
        value={search}
        onValueChange={setSearch}
        placeholder="Rechercher"
        aria-label="Rechercher une catégorie"
      />
      <Field>
        <FieldLabel htmlFor="gf-note">Note</FieldLabel>
        <Textarea id="gf-note" placeholder="Facultatif" />
      </Field>
      <Field>
        <FieldLabel htmlFor="gf-pass">Mot de passe</FieldLabel>
        <PasswordInput id="gf-pass" defaultValue="motdepasse" />
      </Field>
      <InputOTP maxLength={6} value="12" aria-label="Code">
        <InputOTPGroup>
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <InputOTPSlot key={index} index={index} />
          ))}
        </InputOTPGroup>
      </InputOTP>
      <div className="flex items-center gap-3">
        <Label htmlFor="gf-switch" className="flex-1">
          Toujours compenser
        </Label>
        <Switch id="gf-switch" defaultChecked />
        <Switch aria-label="Non" />
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Label className="flex items-center gap-2.5">
          <Checkbox defaultChecked /> Exceptionnelle
        </Label>
        <Label className="flex items-center gap-2.5">
          <Checkbox /> Partagée
        </Label>
      </div>
      <RadioGroup defaultValue="expense" className="flex gap-5">
        <Label className="flex items-center gap-2.5">
          <RadioGroupItem value="expense" /> Dépense
        </Label>
        <Label className="flex items-center gap-2.5">
          <RadioGroupItem value="income" /> Revenu
        </Label>
      </RadioGroup>
      <Slider defaultValue={[40]} max={100} aria-label="Part" />
    </div>
  )
}

/** The Opérations toolbar on the page, a form in a sheet. */
export const Champs: Story = {
  render: () => (
    <div className="bg-background flex min-h-svh items-start p-6">
      <div
        data-glass-frame
        className="bg-background text-foreground relative w-[390px] overflow-hidden rounded-[1.6rem] shadow-[0_0_0_1px_rgb(0_0_0/8%)]"
      >
        <div className="glass-chrome flex h-12 items-center px-4 text-[17px] font-semibold">
          Opérations
        </div>
        <Toolbar />
        <Form />
      </div>
    </div>
  ),
}
