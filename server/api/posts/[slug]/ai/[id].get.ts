import { aiRequest } from '../../../../ai/http'
export default defineEventHandler(event => aiRequest(event,'get'))
