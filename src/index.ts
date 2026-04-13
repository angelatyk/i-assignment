import * as dotenv from 'dotenv';
dotenv.config();

// Entry point: receives trigger (GitHub Issue event) and starts the graph
import { harnessGraph } from './graph/graph';

export { harnessGraph };
