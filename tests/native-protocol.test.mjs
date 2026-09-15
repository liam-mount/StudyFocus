import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { serve } from '../engine/service.mjs'

const native = path.resolve('native/build/StudyFocusNative')
const nativeAvailable = fs.existsSync(native) && fs.statSync(native).isFile()
const nativeSkip = nativeAvailable ? false : 'compiled native binary is unavailable at native/build/StudyFocusNative'

function runNative(args, input) {
  return spawnSync(native, args, {
    input: JSON.stringify(input),
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  })
}

function writeChunk(stream, chunk) {
  return new Promise((resolve, reject) => {
    stream.write(chunk, (error) => (error ? reject(error) : resolve()))
  })
}

function readFrame(child) {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0)
    let stderr = ''
    let settled = false

    const fail = (error) => {
      if (!settled) {
        settled = true
        reject(error)
      }
    }

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.stdout.on('data', (chunk) => {
      if (settled) return
      buffer = Buffer.concat([buffer, chunk])
      if (buffer.length < 4) return
      const size = buffer.readUInt32LE(0)
      if (size > 1024 * 1024 || buffer.length < size + 4) return
      try {
        const value = JSON.parse(buffer.subarray(4, size + 4).toString('utf8'))
        settled = true
        resolve(value)
      } catch (error) {
        fail(error)
      }
    })
    child.once('error', fail)
    child.once('close', (code, signal) => {
      if (!settled) fail(new Error(`native bridge exited before a frame (code ${code}, signal ${signal}): ${stderr}`))
    })
  })
}

async function closeChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  await once(child, 'close').catch(() => {})
}

test('hosts-preview preserves unrelated hosts text across add and remove', { skip: nativeSkip, timeout: 5_000 }, () => {
  const original = [
    '# unrelated header kept byte-for-byte',
    '127.0.0.1 localhost',
    '192.0.2.10 notes.example.test',
    '',
  ].join('\n')

  const added = runNative(['hosts-preview'], { text: original, domains: ['example.com', 'study.test'] })
  assert.equal(added.status, 0, added.stderr)
  const blocked = JSON.parse(added.stdout).text
  assert.equal(blocked.startsWith(original), true)
  assert.match(blocked, /0\.0\.0\.0 example\.com/)
  assert.match(blocked, /:: www\.study\.test/)

  const removed = runNative(['hosts-preview'], { text: blocked, domains: [] })
  assert.equal(removed.status, 0, removed.stderr)
  assert.equal(JSON.parse(removed.stdout).text, original)
})

test('hosts-preview rejects an incomplete managed marker before producing replacement text', { skip: nativeSkip, timeout: 5_000 }, () => {
  const malformed = [
    '# keep this line',
    '# >>> studyfocus >>> managed automatically — do not edit by hand',
    '0.0.0.0 example.com',
  ].join('\n')

  const result = runNative(['hosts-preview'], { text: malformed, domains: ['study.test'] })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /hosts block is incomplete/i)
  assert.equal(result.stdout, '')
  assert.equal(malformed.includes('0.0.0.0 example.com'), true)
})

test('native bridge frames chrome sync responses and handles fragmented input', { skip: nativeSkip, timeout: 10_000 }, async (t) => {
  const dir = fs.mkdtempSync('/tmp/studyfocus-native-')
  let service = null
  let child = null
  t.after(async () => {
    await closeChild(child)
    service?.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  service = await serve({ dir, native, simulation: true })
  assert.ok(service, 'engine service should start in a fresh temporary directory')

  child = spawn(native, ['native'], {
    env: { ...process.env, STUDYFOCUS_DATA_DIR: dir },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const responsePromise = readFrame(child)
  const payload = Buffer.from(JSON.stringify({ id: 'test-client-123', revision: '', name: 'Test' }))
  const frame = Buffer.alloc(4 + payload.length)
  frame.writeUInt32LE(payload.length, 0)
  payload.copy(frame, 4)

  // Split both the header and body so the native readExactly loop must reassemble it.
  await writeChunk(child.stdin, frame.subarray(0, 1))
  await new Promise((resolve) => setTimeout(resolve, 10))
  await writeChunk(child.stdin, frame.subarray(1, 4))
  await new Promise((resolve) => setTimeout(resolve, 10))
  await writeChunk(child.stdin, frame.subarray(4, 9))
  await new Promise((resolve) => setTimeout(resolve, 10))
  await writeChunk(child.stdin, frame.subarray(9))
  child.stdin.end()

  const response = await responsePromise
  assert.equal(response.ok, true)
  assert.equal(response.value.session, null)
  if (child.exitCode === null && child.signalCode === null) await once(child, 'close')
})

test('native emergency recovery releases Chrome with no engine and preserves corrupt data', {skip:nativeSkip,timeout:10000}, async t => {
 const dir=fs.mkdtempSync('/tmp/studyfocus-recovery-');let child
 t.after(async()=>{await closeChild(child);fs.rmSync(dir,{recursive:true,force:true})})
 fs.writeFileSync(path.join(dir,'state.json'),'corrupt but preserved')
 fs.writeFileSync(path.join(dir,'hosts-session.json'),'old lease')
 const env={...process.env,STUDYFOCUS_DATA_DIR:dir}
 const recovery=spawnSync(native,['recover'],{env,encoding:'utf8'})
 assert.equal(recovery.status,0,recovery.stderr)
 assert.equal(JSON.parse(recovery.stdout).ok,true)
 assert.equal(fs.existsSync(path.join(dir,'hosts-session.json')),false)
 child=spawn(native,['native'],{env,stdio:['pipe','pipe','pipe']})
 const answer=readFrame(child)
 const body=Buffer.from(JSON.stringify({id:'recovery-client',revision:'old'})),header=Buffer.alloc(4)
 header.writeUInt32LE(body.length);child.stdin.end(Buffer.concat([header,body]))
 const response=await answer
 assert.equal(response.ok,true);assert.equal(response.value.session,null)
 assert.equal(response.value.revision,'emergency-recovery')
 assert.equal(fs.readFileSync(path.join(dir,'state.json'),'utf8'),'corrupt but preserved')
})
